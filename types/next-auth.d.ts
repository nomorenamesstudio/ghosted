import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** Whether the account email has been verified. */
      emailVerified?: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** Absolute cap for the session (iat + 7 days). */
    exp?: number;
    /** Whether the account email has been verified (mirrors the DB flag). */
    emailVerified?: boolean;
  }
}
