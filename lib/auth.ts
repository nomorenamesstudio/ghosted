import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Linkedin from "next-auth/providers/linkedin";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";
import { users, type Provider } from "@/lib/db/schema";
import { registrationOpen } from "@/lib/config/flags";
import {
  configuredOAuthProviders,
  isOAuthProvider,
} from "@/lib/config/oauth-providers";
import {
  classifyOAuthSignIn,
  oauthSignInDecision,
  resolveOAuthUser,
} from "@/lib/services/oauth-accounts";
import { resolveGravatarPath } from "@/lib/services/gravatar";
import {
  accountThrottle,
  clearLoginFailures,
  globalThrottle,
  recordLoginFailure,
} from "@/lib/auth/login-throttle";
import { logger } from "@/lib/utils/logger";

export const SESSION_IDLE_SECONDS = 30 * 24 * 60 * 60; // 30 days idle
export const SESSION_ABSOLUTE_SECONDS = 7 * 24 * 60 * 60; // 7 days absolute
export const BCRYPT_ROUNDS = 12;

/**
 * The OAuth providers this deployment has credentials for. One reader shared
 * with the login page and Settings, so the buttons, the provider list and the
 * "connected accounts" panel can never disagree about what is available.
 */
const oauthProviders = configuredOAuthProviders();

/**
 * The provider's own, stable id for the member.
 *
 * Deliberately not `user.id`: @auth/core fills that with a fresh
 * `crypto.randomUUID()` on every sign-in and keeps the provider's id in
 * `account.providerAccountId` (@auth/core `getUserAndAccount`). An identity
 * keyed on `user.id` matches nothing on the next sign-in, so every sign-in
 * would write another identity row and every email-less account would multiply.
 */
function providerAccountId(
  user: { id?: string | number },
  account: { providerAccountId?: string },
): string {
  return account.providerAccountId || String(user.id ?? "");
}

// In production, pin the canonical base URL so Auth.js never derives it from
// the spoofable `x-forwarded-host` / `x-forwarded-proto` request headers
// (see @auth/core createActionURL). Prefer an explicit AUTH_URL; fall back
// to NEXT_PUBLIC_APP_URL when it's a real https origin.
if (
  process.env.NODE_ENV === "production" &&
  !process.env.AUTH_URL &&
  !process.env.NEXTAUTH_URL
) {
  const publicUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (publicUrl && publicUrl.startsWith("https://")) {
    process.env.AUTH_URL = publicUrl;
  } else {
    logger.error(
      "AUTH_URL is not set and NEXT_PUBLIC_APP_URL is not an https URL — " +
        "Auth.js will derive its base URL from request headers",
    );
  }
}

/**
 * Auth.js v5 configuration.
 *
 * - Credentials (email + password, bcrypt, 12 rounds) — the only provider
 *   enabled out of the box; OAuth providers are included only when their
 *   client id/secret env vars are set (stubbed in development).
 * - JWT sessions: 30-day idle TTL (session.maxAge) hard-capped at 7 days
 *   absolute, enforced via the `authTime` claim in the jwt callback (an
 *   `exp`/`iat` pin alone is useless because @auth/core re-signs the JWT
 *   with now + maxAge on every request). The `sessionEpoch` claim revokes a
 *   token the moment the account's credential changes.
 *
 * The config object is exported so tests can drive a callback directly instead
 * of re-implementing what it does — the revocation and throttle rules are the
 * kind that must be exercised as they run, not as they are described.
 */
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt", maxAge: SESSION_IDLE_SECONDS },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        // The per-account throttle is checked *here* rather than in the route
        // handler that usually fronts this callback: Auth.js serves the same
        // credential check from `/api/auth/callback/credentials`, which never
        // runs `/api/auth/login`, so a limit that lives only in the route is a
        // limit an attacker walks around (measured — see
        // lib/auth/login-throttle.ts).
        //
        // A peek, not a spend: both counters move only when a password turns out
        // to be wrong, so an account's own successful sign-ins can neither use
        // up its budget nor be refused by it.
        if (!accountThrottle(email).ok) return null;

        // The process-wide failure cap is checked before any database or
        // bcrypt work, which is the only way it bounds guessing: it has to
        // refuse attempts it has not looked at, including correct ones for the
        // rest of the window. See the trade-off in login-throttle.ts.
        if (!globalThrottle().ok) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (!user?.passwordHash) {
          // An address that cannot sign in this way is still a failed attempt.
          recordLoginFailure(email);
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          recordLoginFailure(email);
          return null;
        }

        // Only failures accumulate: a successful sign-in starts the account's
        // window over. The global counter is deliberately not cleared here —
        // one valid sign-in must not erase an attacker's accumulated failures.
        clearLoginFailures(email);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image ?? undefined,
          emailVerified: user.emailVerified,
          mustChangePassword: user.mustChangePassword,
          sessionEpoch: user.sessionEpoch,
        };
      },
    }),
    ...oauthProviders.map(({ provider, clientId, clientSecret }) =>
      provider === "google"
        ? Google({ clientId, clientSecret })
        : Linkedin({ clientId, clientSecret }),
    ),
  ],
  callbacks: {
    /**
     * The gate, and the only place a stranger is turned away before anything is
     * written: linking to an existing account is a sign-in, creating one is
     * registration, and `ALLOW_REGISTRATION=false` means it. A provider that
     * shares no email cannot be matched to an account, so it is refused with its
     * own message instead of getting a fabricated address.
     *
     * Returning a string redirects (see handleAuthorized in @auth/core); the
     * default `redirect` callback keeps it to same-origin paths.
     */
    async signIn({ user, account, profile }) {
      if (!account || !isOAuthProvider(account.provider)) return true;

      // A provider that says the address is *not* verified has not proved the
      // mailbox, and that is exactly what the adopt-or-attach rule below turns
      // on: an unverified address that matches a local account would attach a
      // provider identity to somebody else's account and mark it verified.
      // `!== false` is deliberate — LinkedIn's OIDC response omits the claim,
      // and a missing claim is not a denial, an explicit false is.
      if (
        (profile as { email_verified?: unknown } | undefined)?.email_verified ===
        false
      ) {
        logger.info(
          { provider: account.provider },
          "oauth: refused sign-in, provider reported the email as unverified",
        );
        return "/login?error=ProviderEmailUnverified";
      }

      const outcome = await classifyOAuthSignIn({
        provider: account.provider,
        providerId: providerAccountId(user, account),
        email: user.email,
        name: user.name,
      });
      const decision = oauthSignInDecision(outcome, {
        registrationOpen: registrationOpen(),
      });
      if (decision === "allow") return true;
      if (decision === "email-required") {
        logger.info(
          { provider: account.provider },
          "oauth: refused sign-in, provider shared no email",
        );
        return "/login?error=OAuthEmailRequired";
      }
      logger.info(
        { provider: account.provider },
        "oauth: refused sign-in, registration is closed",
      );
      return "/login?error=RegistrationClosed";
    },
    async jwt({ token, user, account, trigger, session }) {
      // Profile updates (name/email) propagate into the JWT immediately so
      // the user menu stays in sync without a fresh sign-in.
      if (trigger === "update") {
        // The update payload names the fields a client just changed, and it is
        // client-supplied: taking `name`, `email` or `emailVerified` from it let
        // a session assert anything about itself (a claim the audit recorded as
        // cosmetic, but `emailVerified` is the flag the unverified cap reads,
        // so it is not a thing to leave to the caller). The payload is a
        // trigger, not a source — every mirrored claim is re-read from the
        // account, and the session argument is deliberately unused.
        void session;
        if (typeof token.sub === "string") {
          const [dbUser] = await db
            .select({
              name: users.name,
              email: users.email,
              emailVerified: users.emailVerified,
              mustChangePassword: users.mustChangePassword,
            })
            .from(users)
            .where(eq(users.id, token.sub))
            .limit(1);
          if (dbUser) {
            // A profile update (e.g. an email change) has already landed in the
            // DB, so this is how the menu and the verification banner stay in
            // sync without a fresh sign-in — and how the forced-change flag is
            // cleared the moment the endpoint clears it.
            token.name = dbUser.name;
            token.email = dbUser.email;
            token.emailVerified = dbUser.emailVerified;
            token.mustChangePassword = dbUser.mustChangePassword;
          }
        }
      }

      // OAuth sign-in: resolve the provider identity to a local account — an
      // existing link, the account that owns the email, or a new account — and
      // pin token.sub to OUR id. The rules live in
      // lib/services/oauth-accounts.ts so they can be tested without Auth.js.
      if (user && account?.provider && isOAuthProvider(account.provider)) {
        const { userId } = await resolveOAuthUser({
          provider: account.provider,
          providerId: providerAccountId(user, account),
          email: user.email,
          name: user.name,
        });
        token.sub = userId;
        if (user.image) token.picture = user.image;
        // OAuth providers verify the email themselves, so the account is
        // always considered verified after linking/creating.
        token.emailVerified = true;
      }

      // Credentials sign-in: carry the DB verified flag into the JWT so the
      // client (verification banner) and server (application cap) both know.
      if (
        user &&
        !(account?.provider && account.provider !== "credentials")
      ) {
        const userEmailVerified = (user as { emailVerified?: unknown })
          .emailVerified;
        token.emailVerified = userEmailVerified === true;

        // Carried at sign-in so the very first request after the boot-seeded
        // password arrives already flagged; the refresh block above keeps it
        // honest afterwards.
        token.mustChangePassword =
          (user as { mustChangePassword?: unknown }).mustChangePassword === true;

        // Pin the revocation counter to the value the credential was *checked
        // against*, not to whatever the row says later in this callback. The
        // Gravatar probe below is an awaited network call, so a password change
        // committing in that window would otherwise be absorbed: the token would
        // be stamped with the new counter and survive the very change it should
        // have died with. Read here, the later comparison in the revocation
        // block fails and the race resolves the safe way. (The OAuth path has no
        // such value to use — adoption bumps the counter *during* this callback
        // — so it is pinned from the row there, which is correct for it.)
        if (typeof (user as { sessionEpoch?: unknown }).sessionEpoch === "number") {
          token.sessionEpoch = (user as { sessionEpoch: number }).sessionEpoch;
        }

        // A stored avatar — the demo account's app icon, or anything a user
        // sets later — beats the anonymous Gravatar probe below.
        if (!token.picture && typeof user.image === "string") {
          token.picture = user.image;
        }

        // Email/password users have no provider photo, so ask Gravatar once,
        // here — and only here. `account` is present at sign-in only, while
        // this callback also runs on every session read, which must stay
        // network-free. A miss leaves token.picture unset, so the menu keeps
        // rendering its initials; a hit points at our own /avatars/<hash>
        // proxy, which is what the browser then caches for a week.
        if (
          account?.provider === "credentials" &&
          !token.picture &&
          typeof user.email === "string"
        ) {
          const gravatar = await resolveGravatarPath(user.email);
          if (gravatar) token.picture = gravatar;
        }
      }

      // Revocation. A JWT carries no server-side session record, so nothing
      // stops a token from working forever (up to the absolute cap below) once
      // it has been copied out of a browser. The `session_epoch` column is the
      // record: it moves whenever the account's credential changes — a
      // password change or reset, a first password, a provider sign-in that
      // clears one — and a token whose claim does not match the row is
      // refused. Deleting the account removes the row, which refuses every
      // token for it here.
      //
      // One indexed lookup per session read, on the same path that already
      // loads the user for the page being rendered.
      if (typeof token.sub === "string") {
        const [row] = await db
          .select({ sessionEpoch: users.sessionEpoch })
          .from(users)
          .where(eq(users.id, token.sub))
          .limit(1);

        if (!row) return null; // account deleted

        if (typeof token.sessionEpoch === "number") {
          if (token.sessionEpoch !== row.sessionEpoch) return null;
        } else if (user) {
          // No claim, and a sign-in in flight: the OAuth path, where adoption
          // bumps the counter during this callback and the session that just
          // proved the provider identity is the one it must not revoke. The
          // credentials path pinned its own (verification-time) value above.
          token.sessionEpoch = row.sessionEpoch;
        } else {
          // No claim and no sign-in in flight: a token minted before this
          // check existed. Nothing has been revoked yet on an account whose
          // counter is still 0, so it is allowed to keep working and is pinned
          // from here on; once any credential has changed, it is exactly the
          // token that has to stop.
          if (row.sessionEpoch > 0) return null;
          token.sessionEpoch = row.sessionEpoch;
        }
      }

      // Absolute session cap: 7 days from sign-in. Enforced here because
      // @auth/core's encode() re-signs the JWT on every request and
      // overwrites `iat`/`exp` (setIssuedAt/setExpirationTime), so an
      // iat-based check would never fire. We stamp a custom `authTime`
      // claim that encode() does not touch, and return null (Auth.js then
      // clears the cookie) once it exceeds the cap.
      //
      // Also stamped for a token that arrives *without* the claim — a session
      // minted before the claim shipped, which otherwise had no absolute bound
      // at all: encode() re-signs it with a fresh 30-day window on every use, so
      // an actively used pre-upgrade cookie never expired. Stamping on the first
      // read gives it at most seven more days instead of indefinitely, and costs
      // nobody a sign-out at deploy.
      if (!token.authTime) {
        token.authTime = Math.floor(Date.now() / 1000);
      }
      if (typeof token.authTime === "number") {
        const now = Math.floor(Date.now() / 1000);
        if (now - token.authTime >= SESSION_ABSOLUTE_SECONDS) return null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.sub === "string") {
        session.user.id = token.sub;
        // The callback's `session.user` type is intersected with AdapterUser
        // (emailVerified: Date | null) even under the JWT strategy, so cast.
        if (typeof token.emailVerified === "boolean") {
          (session.user as { emailVerified?: boolean }).emailVerified =
            token.emailVerified;
        }
        if (typeof token.mustChangePassword === "boolean") {
          (session.user as { mustChangePassword?: boolean }).mustChangePassword =
            token.mustChangePassword;
        }
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

export type { Provider }; // re-exported for route handlers
