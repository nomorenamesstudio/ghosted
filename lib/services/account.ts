import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";
import { EXPORT_VERSION } from "@/lib/services/import";
import {
  applications,
  emailVerificationTokens,
  milestones,
  users,
  type Milestone,
  type PatienceLevel,
  type User,
} from "@/lib/db/schema";
import { ApiError } from "@/lib/utils/api";
import { logger } from "@/lib/utils/logger";
import { BCRYPT_ROUNDS } from "@/lib/auth";

const hashToken = (t: string) =>
  createHash("sha256").update(t).digest("hex");

/** Update profile fields (name/email). Throws 409 EMAIL_TAKEN on duplicates. */
export async function updateProfile(
  userId: string,
  input: {
    name?: string;
    email?: string;
    patienceLevel?: PatienceLevel;
    currentPassword?: string;
  },
): Promise<{ user: User; emailChanged: boolean; previousEmail: string }> {
  const [current] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!current) throw new ApiError(404, "User not found", "NOT_FOUND");

  const values: {
    name?: string;
    email?: string;
    emailVerified?: boolean;
    emailVerifiedAt?: Date | null;
    patienceLevel?: PatienceLevel;
  } = {};
  if (input.name !== undefined) values.name = input.name;
  // Changes how soon a silent application is shown as ghosted.
  if (input.patienceLevel !== undefined) {
    values.patienceLevel = input.patienceLevel;
  }
  // Moving the sign-in identifier is not something a session can do on its own:
  // the address is also where a password reset would be sent, so a stolen
  // session could otherwise hand itself a password it never knew, and then
  // delete the account through the front door (static audit, third pass). An
  // account with no password has none to prove — it signs in through a
  // provider — so it moves with the session alone, and either way the old
  // address is told afterwards.
  if (
    input.email !== undefined &&
    input.email !== current.email &&
    current.passwordHash
  ) {
    if (!input.currentPassword) {
      throw new ApiError(
        400,
        "Enter your current password to change your email address",
        "PASSWORD_REQUIRED",
      );
    }
    await verifyPassword(userId, input.currentPassword);
  }

  if (input.email !== undefined) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (existing && existing.id !== userId) {
      throw new ApiError(
        409,
        "An account with this email already exists",
        "EMAIL_TAKEN",
      );
    }
    values.email = input.email;
    if (input.email !== current.email) {
      // A changed email is unverified until the new address is confirmed.
      values.emailVerified = false;
      values.emailVerifiedAt = null;
    }
  }
  if (Object.keys(values).length === 0) {
    throw new ApiError(400, "Nothing to update", "VALIDATION_ERROR");
  }

  const [user] = await db
    .update(users)
    .set(values)
    .where(eq(users.id, userId))
    .returning();
  return {
    user,
    emailChanged: input.email !== undefined && input.email !== current.email,
    previousEmail: current.email,
  };
}

/**
 * Verify the account's current password, or throw.
 *
 * Shared by the two places a password is *proved* before something destructive
 * happens: changing it, and deleting the account. Both need the same answer to
 * "is this really the account holder", and both need the same error shape.
 */
export async function verifyPassword(
  userId: string,
  password: string,
): Promise<void> {
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new ApiError(404, "User not found", "NOT_FOUND");
  if (!user.passwordHash) {
    throw new ApiError(
      400,
      "This account has no password (OAuth sign-in only)",
      "NO_PASSWORD",
    );
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new ApiError(401, "Current password is incorrect", "INVALID_PASSWORD");
  }
}

/** Whether the account has a password at all — false for provider-only ones. */
export async function hasPassword(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new ApiError(404, "User not found", "NOT_FOUND");
  return user.passwordHash !== null;
}

/**
 * Move the account's session counter on, which is what revokes the sessions
 * that came before it (see the `jwt` callback in lib/auth.ts).
 *
 * Called from every path that changes how the account can be entered —
 * change, reset, first password, a provider sign-in clearing one. A credential
 * change that leaves older tokens working is the finding this closes.
 */
function bumpedSessionEpoch() {
  return sql`${users.sessionEpoch} + 1`;
}

/** Verify the current password and set a new one. */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await verifyPassword(userId, currentPassword);

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db
    .update(users)
    .set({
      passwordHash,
      mustChangePassword: false,
      sessionEpoch: bumpedSessionEpoch(),
    })
    .where(eq(users.id, userId));
}

/**
 * Set the *first* password on an account that has none.
 *
 * Accounts created by Google or LinkedIn have no password, and an account whose
 * email was unverified when a provider adopted it has its old one dropped (see
 * the adopt rule in lib/services/oauth-accounts.ts). Without this, both states
 * are dead ends: `changePassword` needs a password to compare, and the reset
 * flow only issues a token for an account that has one — so such a user could
 * never sign in with email again.
 *
 * Refuses an account that already has a password, so this can never be used to
 * overwrite one without proving it.
 */
export async function setPassword(
  userId: string,
  newPassword: string,
): Promise<void> {
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new ApiError(404, "User not found", "NOT_FOUND");
  if (user.passwordHash) {
    throw new ApiError(
      400,
      "This account already has a password — change it instead",
      "PASSWORD_EXISTS",
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db
    .update(users)
    .set({
      passwordHash,
      mustChangePassword: false,
      sessionEpoch: bumpedSessionEpoch(),
    })
    .where(eq(users.id, userId));
}

/** GDPR erasure: delete the account (cascades to applications, milestones, tokens). */
export async function deleteAccount(userId: string): Promise<void> {
  // No session bump needed: the row is gone, and the `jwt` callback refuses a
  // token whose account no longer exists.
  await db.delete(users).where(eq(users.id, userId));
}

/**
 * Acknowledge the one-time notice that a provider sign-in cleared the account's
 * password: it has been told, so the dashboard stops showing it. Deliberately
 * just a marker — the password itself is already gone, and Settings offers to
 * set a new one for as long as there is none.
 */
export async function acknowledgePasswordDrop(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ passwordDroppedAt: null })
    .where(eq(users.id, userId));
}

/**
 * Create a fresh email-verification token for the user (invalidating any
 * previous one) and return the raw token together with the address it was
 * issued for (only ever shown once, emailed).
 *
 * "Invalidating any previous one" is literal: every outstanding token for the
 * account is deleted, not just the used and expired ones, so a superseded link
 * in an old inbox cannot be redeemed later.
 */
export async function createEmailVerification(
  userId: string,
): Promise<{ raw: string; email: string }> {
  const ttlMinutes = Number(process.env.EMAIL_VERIFICATION_TTL_MINUTES ?? 60 * 24);
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new ApiError(404, "User not found", "NOT_FOUND");

  await db
    .delete(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, userId));

  const raw = randomBytes(32).toString("hex");
  await db.insert(emailVerificationTokens).values({
    userId,
    // The address is part of what the token proves. Changing the account's
    // email therefore invalidates this token, instead of letting it verify an
    // address it was never sent to (static audit 2026-10-14).
    email: user.email,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
  });
  return { raw, email: user.email };
}

/** Issue a verification token and return it together with the user's email. */
export async function issueEmailVerification(
  userId: string,
): Promise<{ raw: string; email: string }> {
  return createEmailVerification(userId);
}

/**
 * Redeem a verification token; marks the user verified and the token used.
 *
 * Refuses when the account's address is no longer the one the token was issued
 * for: the token says "this mailbox is mine", and an address change since then
 * makes that claim stale. Failing closed is the safe direction — the user asks
 * for a new link, which is one click.
 */
export async function verifyEmail(
  rawToken: string,
): Promise<{ email: string } | null> {
  const [row] = await db
    .select()
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.tokenHash, hashToken(rawToken)),
        isNull(emailVerificationTokens.usedAt),
      ),
    )
    .limit(1);
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;

  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, row.userId));
  if (!user || user.email !== row.email) {
    logger.warn(
      { userId: row.userId },
      "verification token refused: the account's address changed after it was issued",
    );
    return null;
  }

  // The address check above and this write used to be separate statements that
  // matched only the id, so an email change committing between them verified an
  // address the token was never issued for (static audit, second pass). The
  // write carries the address it was checked against, which makes the condition
  // and the update one statement: no window, no second look-up.
  const now = new Date();
  const [verified] = await db
    .update(users)
    .set({ emailVerified: true, emailVerifiedAt: now })
    .where(and(eq(users.id, row.userId), eq(users.email, row.email)))
    .returning({ id: users.id });
  if (!verified) {
    logger.warn(
      { userId: row.userId },
      "verification token refused: the address changed before the write landed",
    );
    return null;
  }
  await db
    .update(emailVerificationTokens)
    .set({ usedAt: now })
    .where(eq(emailVerificationTokens.id, row.id));

  return user;
}

/**
 * The exported file, as it appears on the wire: every timestamp is an ISO
 * string. Keeping `Date` objects here would have made the in-process value
 * (what tests and any future importer see) disagree with the file the browser
 * actually downloads, which is exactly the kind of gap that ships a bug.
 */
export interface UserExport {
  /** Format version, so an importer can refuse a file from the future. */
  version: number;
  exportedAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    provider: string;
    createdAt: string;
  };
  applications: Array<Record<string, unknown> & { milestones: Array<Record<string, unknown>> }>;
}

/** Timestamps to ISO strings, one level deep per row. */
function serialiseRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

/** GDPR portability (Art. 20): all of the user's data as structured JSON. */
export async function exportUserData(userId: string): Promise<UserExport | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;

  const apps = await db
    .select()
    .from(applications)
    .where(eq(applications.userId, userId));

  const milestonesById = new Map<string, Milestone[]>();
  if (apps.length > 0) {
    const rows = await db
      .select()
      .from(milestones)
      .where(
        inArray(
          milestones.applicationId,
          apps.map((a) => a.id),
        ),
      )
      .orderBy(milestones.stepOrder);
    for (const m of rows) {
      const list = milestonesById.get(m.applicationId) ?? [];
      list.push(m);
      milestonesById.set(m.applicationId, list);
    }
  }

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      provider: user.provider,
      createdAt: user.createdAt.toISOString(),
    },
    applications: apps.map((app) => ({
      ...serialiseRow(app as unknown as Record<string, unknown>),
      milestones: (milestonesById.get(app.id) ?? []).map((milestone) =>
        serialiseRow(milestone as unknown as Record<string, unknown>),
      ),
    })),
  };
}
