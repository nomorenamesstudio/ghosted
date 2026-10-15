import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  BCRYPT_ROUNDS: 12,
  SESSION_IDLE_SECONDS: 0,
  SESSION_ABSOLUTE_SECONDS: 0,
}));

vi.mock("@/lib/emails", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(true),
  sendEmailChangedEmail: vi.fn().mockResolvedValue(true),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
}));

import { PATCH as PROFILE } from "@/app/api/auth/profile/route";
import { sendEmailChangedEmail, sendVerificationEmail } from "@/lib/emails";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import {
  authMock,
  createUser,
  jsonRequest,
  mockSession,
  readJson,
  resetDb,
} from "@/tests/helpers";

/**
 * The sign-in address is also the recovery address.
 *
 * A session on its own used to be enough to move it, which made the
 * current-password gate on account deletion optional: change the address to a
 * mailbox you control, ask for a reset there, choose a password, delete the
 * account (static audit, third pass). These tests pin the gate, and the notice
 * the address that just lost its claim receives.
 */
const base = "http://localhost/api/auth";

beforeEach(async () => {
  await resetDb();
  vi.mocked(sendEmailChangedEmail).mockClear();
  vi.mocked(sendVerificationEmail).mockClear();
});

describe("PATCH /api/auth/profile — changing the sign-in address", () => {
  it("refuses without the current password, and moves nothing", async () => {
    const user = await createUser("stays@test.dev");
    authMock.mockResolvedValueOnce(mockSession(user.id));

    const res = await PROFILE(
      jsonRequest(`${base}/profile`, "PATCH", { email: "moved@test.dev" }),
    );

    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("PASSWORD_REQUIRED");
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.email).toBe("stays@test.dev");
    expect(sendEmailChangedEmail).not.toHaveBeenCalled();
  });

  it("refuses a wrong password", async () => {
    const user = await createUser("wrongpw@test.dev");
    authMock.mockResolvedValueOnce(mockSession(user.id));

    const res = await PROFILE(
      jsonRequest(`${base}/profile`, "PATCH", {
        email: "moved@test.dev",
        currentPassword: "not-the-password",
      }),
    );

    expect(res.status).toBe(401);
    expect((await readJson(res)).code).toBe("INVALID_PASSWORD");
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.email).toBe("wrongpw@test.dev");
  });

  it("moves the address with the password, and tells the old one", async () => {
    const user = await createUser("old@test.dev");
    authMock.mockResolvedValueOnce(mockSession(user.id));

    const res = await PROFILE(
      jsonRequest(`${base}/profile`, "PATCH", {
        email: "new@test.dev",
        currentPassword: user.password,
      }),
    );

    expect(res.status).toBe(200);
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.email).toBe("new@test.dev");
    // A changed address is unverified until the new one confirms.
    expect(row.emailVerified).toBe(false);
    // The new address gets its link; the old address gets the news.
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      "new@test.dev",
      expect.any(String),
    );
    expect(sendEmailChangedEmail).toHaveBeenCalledWith(
      "old@test.dev",
      "new@test.dev",
    );
  });

  it("still lets a provider-only account move its address with the session alone", async () => {
    // Nothing to prove: the account signs in through a provider, so it has no
    // password to ask for, and the old address is notified either way.
    const user = await createUser("provider@test.dev");
    await db
      .update(users)
      .set({ passwordHash: null, provider: "google" })
      .where(eq(users.id, user.id));

    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await PROFILE(
      jsonRequest(`${base}/profile`, "PATCH", { email: "provider-new@test.dev" }),
    );

    expect(res.status).toBe(200);
    expect(sendEmailChangedEmail).toHaveBeenCalledWith(
      "provider@test.dev",
      "provider-new@test.dev",
    );
  });
});
