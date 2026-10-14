import { vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db, createRawClient } from "@/lib/db/client";
import { users, type User } from "@/lib/db/schema";
import { auth } from "@/lib/auth";

/** Fast bcrypt rounds for tests (the 12-round default is used in the app). */
export const TEST_BCRYPT_ROUNDS = 4;

/**
 * Typed mock of Auth.js's `auth()`. Integration tests `vi.mock("@/lib/auth")`
 * and then use this to drive sessions; the cast sidesteps next-auth's
 * middleware-oriented typing of `auth`.
 */
export type SessionLike = {
  user: {
    id: string;
    name: string;
    email: string;
    /** Set on a boot-seeded owner whose generated password must be replaced. */
    mustChangePassword?: boolean;
  };
  expires: string;
};

export const authMock = vi.mocked(
  auth as unknown as () => Promise<SessionLike | null>,
);

export async function resetDb(): Promise<void> {
  const sql = createRawClient();
  await sql`TRUNCATE TABLE users CASCADE`;
  await sql.end();
}

export interface TestUser extends User {
  password: string;
}

export async function createUser(
  email = `user-${crypto.randomUUID()}@test.dev`,
  name = "Test User",
  password = "password123",
  options: { emailVerified?: boolean } = {},
): Promise<TestUser> {
  const passwordHash = await bcrypt.hash(password, TEST_BCRYPT_ROUNDS);
  const [user] = await db
    .insert(users)
    .values({
      email,
      name,
      passwordHash,
      provider: "email",
      // Verified by default so CRUD tests don't trip the 3-application cap;
      // auth/verification tests opt out with { emailVerified: false }.
      emailVerified: options.emailVerified ?? true,
    })
    .returning();
  return { ...user, password };
}

/** Shape of a mocked Auth.js session. */
export function mockSession(
  userId: string,
  options: { mustChangePassword?: boolean } = {},
): SessionLike {
  return {
    user: {
      id: userId,
      name: "Test User",
      email: "test@test.dev",
      mustChangePassword: options.mustChangePassword ?? false,
    },
    expires: new Date(Date.now() + 60_000).toISOString(),
  };
}

export function jsonRequest(
  url: string,
  method: string,
  body?: unknown,
  headers?: Record<string, string>,
): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * A CSRF pair as Auth.js mints it: the cookie carries `token|sha256(token +
 * AUTH_SECRET)`, and the request carries the bare token.
 *
 * Built here rather than by calling `/api/auth/csrf`, because a route test
 * drives the handler directly and never runs the Auth.js handler that would set
 * the cookie.
 */
export function csrfPair(secret = process.env.AUTH_SECRET ?? ""): {
  csrfToken: string;
  cookie: string;
} {
  const csrfToken = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(`${csrfToken}${secret}`).digest("hex");
  // Percent-encoded, as Next's cookie serializer writes it: the value contains a
  // `|`, and a parser that splits the raw header value finds nothing to split on.
  const value = encodeURIComponent(`${csrfToken}|${hash}`);
  return { csrfToken, cookie: `authjs.csrf-token=${value}` };
}

/** A request carrying a freshly minted, valid CSRF pair in body and cookie. */
export function csrfRequest(
  url: string,
  method: string,
  body: Record<string, unknown> = {},
): Request {
  const { csrfToken, cookie } = csrfPair();
  return jsonRequest(url, method, { ...body, csrfToken }, { cookie });
}

/** Read a NextResponse as JSON. */
export async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}
