import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Linkedin from "next-auth/providers/linkedin";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";
import { users, type Provider } from "@/lib/db/schema";
import { logger } from "@/lib/utils/logger";

export const SESSION_IDLE_SECONDS = 30 * 24 * 60 * 60; // 30 days idle
export const SESSION_ABSOLUTE_SECONDS = 7 * 24 * 60 * 60; // 7 days absolute
export const BCRYPT_ROUNDS = 12;

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
 *   with now + maxAge on every request).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
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

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: user.emailVerified,
        };
      },
    }),
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
          }),
        ]
      : []),
    ...(process.env.AUTH_LINKEDIN_ID && process.env.AUTH_LINKEDIN_SECRET
      ? [
          Linkedin({
            clientId: process.env.AUTH_LINKEDIN_ID,
            clientSecret: process.env.AUTH_LINKEDIN_SECRET,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user, account, trigger, session }) {
      // Profile updates (name/email) propagate into the JWT immediately so
      // the user menu stays in sync without a fresh sign-in.
      if (trigger === "update" && session) {
        const s = session as {
          name?: string;
          email?: string;
          emailVerified?: boolean;
          user?: { name?: string; email?: string; emailVerified?: boolean };
        };
        if (typeof s.name === "string") token.name = s.name;
        if (typeof s.email === "string") token.email = s.email;
        if (typeof s.emailVerified === "boolean") {
          token.emailVerified = s.emailVerified;
        }
        if (s.user) {
          if (typeof s.user.name === "string") token.name = s.user.name;
          if (typeof s.user.email === "string") token.email = s.user.email;
          if (typeof s.user.emailVerified === "boolean") {
            token.emailVerified = s.user.emailVerified;
          }
        }
        // A profile update (e.g. email change) may have reset verification in
        // the DB — refresh the flag so the banner and cap stay in sync
        // without requiring a fresh sign-in.
        if (typeof token.sub === "string") {
          const [dbUser] = await db
            .select({ emailVerified: users.emailVerified })
            .from(users)
            .where(eq(users.id, token.sub))
            .limit(1);
          if (dbUser) {
            token.emailVerified = dbUser.emailVerified;
          }
        }
      }

      // OAuth sign-in: find-or-create our DB user and pin token.sub to OUR id.
      if (user && account?.provider && account.provider !== "credentials") {
        const provider = account.provider as Provider;
        const providerId = String(user.id);
        let [dbUser] = await db
          .select()
          .from(users)
          .where(
            and(eq(users.provider, provider), eq(users.providerId, providerId)),
          )
          .limit(1);

        if (!dbUser) {
          const email = user.email?.trim().toLowerCase();
          if (email) {
            [dbUser] = await db
              .select()
              .from(users)
              .where(eq(users.email, email))
              .limit(1);
            if (dbUser) {
              if (dbUser.emailVerified) {
                // Safe link: the existing account already proved email
                // ownership via a verification link, so attaching the OAuth
                // identity to it is legitimate.
                [dbUser] = await db
                  .update(users)
                  .set({ provider, providerId })
                  .where(eq(users.id, dbUser.id))
                  .returning();
              } else {
                // The OAuth provider has just verified this email, so this
                // user owns it. The existing account is unverified (possibly
                // registered by someone else — email squatting). Adopt it for
                // the verified OAuth identity, but drop the password
                // credential so a squatter can never keep password access to
                // the account afterwards.
                [dbUser] = await db
                  .update(users)
                  .set({
                    provider,
                    providerId,
                    emailVerified: true,
                    emailVerifiedAt: new Date(),
                    passwordHash: null,
                  })
                  .where(eq(users.id, dbUser.id))
                  .returning();
              }
            }
          }
          if (!dbUser) {
            [dbUser] = await db
              .insert(users)
              .values({
                email: email ?? `${providerId}@${provider}.local`,
                name: user.name ?? "User",
                provider,
                providerId,
                // OAuth providers verify the email themselves.
                emailVerified: true,
              })
              .returning();
          }
        }
        token.sub = dbUser.id;
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
      }

      // Absolute session cap: 7 days from sign-in. Enforced here because
      // @auth/core's encode() re-signs the JWT on every request and
      // overwrites `iat`/`exp` (setIssuedAt/setExpirationTime), so an
      // iat-based check would never fire. We stamp a custom `authTime`
      // claim at sign-in that encode() does not touch, and return null
      // (Auth.js then clears the cookie) once it exceeds the cap.
      if (user && !token.authTime) {
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
      }
      return session;
    },
  },
});

export type { Provider }; // re-exported for route handlers
