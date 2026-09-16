import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";
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
import { BCRYPT_ROUNDS } from "@/lib/auth";

const hashToken = (t: string) =>
  createHash("sha256").update(t).digest("hex");

/** Update profile fields (name/email). Throws 409 EMAIL_TAKEN on duplicates. */
export async function updateProfile(
  userId: string,
  input: { name?: string; email?: string; patienceLevel?: PatienceLevel },
): Promise<{ user: User; emailChanged: boolean }> {
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
  return { user, emailChanged: input.email !== undefined && input.email !== current.email };
}

/** Verify the current password and set a new one. */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const [user] = await db
    .select()
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

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    throw new ApiError(401, "Current password is incorrect", "INVALID_PASSWORD");
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

/** GDPR erasure: delete the account (cascades to applications, milestones, tokens). */
export async function deleteAccount(userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}

/**
 * Create a fresh email-verification token for the user (invalidating any
 * previous one) and return the raw token (only ever shown once, emailed).
 */
export async function createEmailVerification(userId: string): Promise<string> {
  const ttlMinutes = Number(process.env.EMAIL_VERIFICATION_TTL_MINUTES ?? 60 * 24);
  // Purge this user's stale tokens (used or expired) so the table never
  // grows unbounded, then issue a fresh one.
  const now = new Date();
  await db
    .delete(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.userId, userId),
        or(
          isNotNull(emailVerificationTokens.usedAt),
          lt(emailVerificationTokens.expiresAt, now),
        ),
      ),
    );
  const raw = randomBytes(32).toString("hex");
  await db.insert(emailVerificationTokens).values({
    userId,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
  });
  return raw;
}

/** Issue a verification token and return it together with the user's email. */
export async function issueEmailVerification(
  userId: string,
): Promise<{ raw: string; email: string }> {
  const raw = await createEmailVerification(userId);
  const [u] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  return { raw, email: u?.email ?? "" };
}

/** Redeem a verification token; marks the user verified and the token used. */
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

  const now = new Date();
  await db
    .update(users)
    .set({ emailVerified: true, emailVerifiedAt: now })
    .where(eq(users.id, row.userId));
  await db
    .update(emailVerificationTokens)
    .set({ usedAt: now })
    .where(eq(emailVerificationTokens.id, row.id));

  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, row.userId));
  return user ?? null;
}

export interface UserExport {
  exportedAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    provider: string;
    createdAt: Date;
  };
  applications: Array<Record<string, unknown> & { milestones: Milestone[] }>;
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
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      provider: user.provider,
      createdAt: user.createdAt,
    },
    applications: apps.map((app) => ({
      ...app,
      milestones: milestonesById.get(app.id) ?? [],
    })),
  };
}
