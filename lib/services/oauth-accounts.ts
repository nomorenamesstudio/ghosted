import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { oauthAccounts, users } from "@/lib/db/schema";
import {
  isOAuthProvider,
  type OAuthProvider,
} from "@/lib/config/oauth-providers";
import { logger } from "@/lib/utils/logger";

/**
 * OAuth identities: which providers an account can be signed into with, and how
 * a provider sign-in is resolved to a local account.
 *
 * A user has one email and any number of linked providers. The `users` provider
 * columns describe how the account was *created* and are never rewritten by a
 * later link, which is what used to happen: signing in with Google and then
 * LinkedIn left the account claiming only LinkedIn, and "which accounts are
 * connected?" had no answer.
 *
 * The deciding is separate from the writing: `classifyOAuthSignIn` says what a
 * sign-in means, `oauthSignInDecision` turns that into allow/refuse, and
 * `resolveOAuthUser` performs it. Auth.js needs the first two *before* it writes
 * anything (the `signIn` callback), and the third afterwards (the `jwt`
 * callback), so the rules have to be callable without side effects.
 */

export interface OAuthProfile {
  provider: OAuthProvider;
  /**
   * The provider's stable subject id — `account.providerAccountId` in Auth.js
   * terms, never `user.id`: @auth/core fills `user.id` with a fresh
   * `crypto.randomUUID()` on every sign-in and keeps the provider's own id in
   * `providerAccountId` (see getUserAndAccount in @auth/core). Keying on
   * `user.id` therefore matches nothing on the next sign-in and writes a new
   * identity row every time.
   */
  providerId: string;
  email?: string | null;
  name?: string | null;
}

export interface LinkedAccount {
  provider: OAuthProvider;
  /** When the identity was first attached, for the Settings list. */
  linkedAt: Date;
}

/** What a provider sign-in means for this deployment's data. */
export type OAuthSignInOutcome =
  /** This provider identity is already attached to an account. */
  | { kind: "linked"; userId: string }
  /** The email belongs to an account that proved it owns the address. */
  | { kind: "attach"; userId: string }
  /** The email belongs to an unverified account, which this sign-in adopts. */
  | { kind: "adopt"; userId: string }
  /** Nothing matches: this sign-in would create the account. */
  | { kind: "create"; email: string }
  /** The provider did not share an email address. */
  | { kind: "no-email" };

/** What to do about it. */
export type OAuthSignInDecision = "allow" | "deny-new-account" | "email-required";

/**
 * The gate. Linking to an account that already exists is a sign-in and always
 * allowed; creating one is registration, and an instance with sign-ups closed
 * means it. A provider that shares no email cannot be matched to anything, and
 * inventing an address for it would create an account nobody can reach.
 */
export function oauthSignInDecision(
  outcome: OAuthSignInOutcome,
  options: { registrationOpen: boolean },
): OAuthSignInDecision {
  switch (outcome.kind) {
    case "no-email":
      return "email-required";
    case "create":
      return options.registrationOpen ? "allow" : "deny-new-account";
    default:
      return "allow";
  }
}

/** Thrown when a sign-in with no email reached the write path. */
export class OAuthEmailRequiredError extends Error {
  constructor() {
    super("The sign-in provider shared no email address");
    this.name = "OAuthEmailRequiredError";
  }
}

export interface ResolvedOAuthUser {
  userId: string;
  /** True when this sign-in was the one that created the account. */
  created: boolean;
  /** True when the provider identity was newly attached to an existing account. */
  linked: boolean;
  /**
   * True when an unverified email account was adopted by the verified OAuth
   * identity, dropping its password — see `resolveOAuthUser`.
   */
  adopted: boolean;
}

type Executor = Pick<typeof db, "select" | "insert" | "update">;

/** The queries shared by the reader and the writer, so they cannot disagree. */
async function classify(
  exec: Executor,
  profile: OAuthProfile,
): Promise<OAuthSignInOutcome> {
  const [linked] = await exec
    .select({ userId: oauthAccounts.userId })
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, profile.provider),
        eq(oauthAccounts.providerId, profile.providerId),
      ),
    )
    .limit(1);
  if (linked) return { kind: "linked", userId: linked.userId };

  const email = normalizeEmail(profile.email);
  if (!email) return { kind: "no-email" };

  const [existing] = await exec
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!existing) return { kind: "create", email };
  return existing.emailVerified
    ? { kind: "attach", userId: existing.id }
    : { kind: "adopt", userId: existing.id };
}

/** What this sign-in would mean, without writing anything. */
export async function classifyOAuthSignIn(
  profile: OAuthProfile,
): Promise<OAuthSignInOutcome> {
  return classify(db, profile);
}

/** Every provider attached to the account, oldest first. */
export async function listLinkedAccounts(
  userId: string,
): Promise<LinkedAccount[]> {
  const rows = await db
    .select({
      provider: oauthAccounts.provider,
      linkedAt: oauthAccounts.linkedAt,
    })
    .from(oauthAccounts)
    .where(eq(oauthAccounts.userId, userId))
    .orderBy(oauthAccounts.linkedAt);
  // The column shares the `provider` enum with `users.provider`, which also has
  // `email` — a value that can never reach this table.
  return rows.flatMap((row) =>
    isOAuthProvider(row.provider)
      ? [{ provider: row.provider, linkedAt: row.linkedAt }]
      : [],
  );
}

/**
 * Resolve a provider sign-in to a local account: find the linked identity, or
 * attach it to the account that owns the email, or create the account.
 *
 * Linking is by email, and only for an account that has proved it owns the
 * address. An *unverified* account with the same email is adopted instead — the
 * provider has just proved ownership, so the account belongs to whoever holds
 * the mailbox, not to whoever typed the address first — and its password is
 * dropped so a squatter cannot keep a way in.
 *
 * All outcomes write the identity and the account together: an identity without
 * its account, or an account whose first sign-in left no identity behind, would
 * both be silent corruption.
 */
export async function resolveOAuthUser(
  profile: OAuthProfile,
): Promise<ResolvedOAuthUser> {
  return db.transaction(async (tx) => {
    const outcome = await classify(tx, profile);

    const attach = (userId: string) =>
      tx
        .insert(oauthAccounts)
        .values({
          userId,
          provider: profile.provider,
          providerId: profile.providerId,
        })
        // A concurrent first sign-in can have attached the same identity
        // already; the row it wrote is the one we want.
        .onConflictDoNothing();

    switch (outcome.kind) {
      case "linked":
        return {
          userId: outcome.userId,
          created: false,
          linked: false,
          adopted: false,
        };

      case "attach":
        await attach(outcome.userId);
        return {
          userId: outcome.userId,
          created: false,
          linked: true,
          adopted: false,
        };

      case "adopt":
        await tx
          .update(users)
          .set({
            emailVerified: true,
            emailVerifiedAt: new Date(),
            passwordHash: null,
            // Stamped so the dashboard can tell the person what happened to
            // their password, and cleared when they acknowledge it.
            passwordDroppedAt: new Date(),
          })
          .where(eq(users.id, outcome.userId));
        await attach(outcome.userId);
        logger.info(
          { userId: outcome.userId, provider: profile.provider },
          "oauth: adopted unverified account for a verified provider email",
        );
        return {
          userId: outcome.userId,
          created: false,
          linked: true,
          adopted: true,
        };

      case "create": {
        const [created] = await tx
          .insert(users)
          .values({
            email: outcome.email,
            name: profile.name?.trim() || "User",
            provider: profile.provider,
            providerId: profile.providerId,
            // The provider verified the address; there is no link to click.
            emailVerified: true,
          })
          .returning({ id: users.id });
        await attach(created.id);
        return { userId: created.id, created: true, linked: true, adopted: false };
      }

      case "no-email":
        // The `signIn` callback refuses this before Auth.js gets here, so
        // reaching it means the gate was bypassed — fail loudly rather than
        // invent an address nobody can reach.
        throw new OAuthEmailRequiredError();
    }
  });
}

/** Lowercased, trimmed, or null when the provider shared nothing usable. */
function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email ? email : null;
}
