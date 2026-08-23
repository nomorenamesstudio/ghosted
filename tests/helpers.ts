import { vi } from "vitest";
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
  user: { id: string; name: string; email: string };
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
): Promise<TestUser> {
  const passwordHash = await bcrypt.hash(password, TEST_BCRYPT_ROUNDS);
  const [user] = await db
    .insert(users)
    .values({ email, name, passwordHash, provider: "email" })
    .returning();
  return { ...user, password };
}

/** Shape of a mocked Auth.js session. */
export function mockSession(userId: string): SessionLike {
  return {
    user: { id: userId, name: "Test User", email: "test@test.dev" },
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

/** Read a NextResponse as JSON. */
export async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}
