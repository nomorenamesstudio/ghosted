import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Linkedin from "next-auth/providers/linkedin";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";
import { users, type Provider } from "@/lib/db/schema";

export const SESSION_IDLE_SECONDS = 30 * 24 * 60 * 60; // 30 days idle
export const SESSION_ABSOLUTE_SECONDS = 7 * 24 * 60 * 60; // 7 days absolute
export const BCRYPT_ROUNDS = 12;

/**
 * Auth.js v5 configuration.
 *
 * - Credentials (email + password, bcrypt, 12 rounds) — the only provider
 *   enabled out of the box; OAuth providers are included only when their
 *   client id/secret env vars are set (stubbed in development).
 * - JWT sessions: 30-day idle TTL (session.maxAge) hard-capped at 7 days
 *   absolute by pinning the JWT `exp` to `iat + 7d` in the jwt callback.
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

        return { id: user.id, email: user.email, name: user.name };
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
    async jwt({ token, user, account }) {
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
              [dbUser] = await db
                .update(users)
                .set({ provider, providerId })
                .where(eq(users.id, dbUser.id))
                .returning();
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
              })
              .returning();
          }
        }
        token.sub = dbUser.id;
        if (user.image) token.picture = user.image;
      }

      // Absolute session cap: exp can never exceed iat + 7 days.
      if (user) {
        // Rebase iat on sign-in so the absolute window starts at login.
        token.iat = Math.floor(Date.now() / 1000);
      }
      const iat = typeof token.iat === "number" ? token.iat : Math.floor(Date.now() / 1000);
      const absoluteExp = iat + SESSION_ABSOLUTE_SECONDS;
      token.exp = Math.min(
        typeof token.exp === "number" ? token.exp : absoluteExp,
        absoluteExp,
      );
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.sub === "string") {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});

export type { Provider }; // re-exported for route handlers
