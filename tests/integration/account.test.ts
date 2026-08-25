import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  BCRYPT_ROUNDS: 12,
  SESSION_IDLE_SECONDS: 0,
  SESSION_ABSOLUTE_SECONDS: 0,
}));

import { PATCH as PROFILE } from "@/app/api/auth/profile/route";
import { POST as CHANGE_PASSWORD } from "@/app/api/auth/change-password/route";
import { DELETE as DELETE_ACCOUNT } from "@/app/api/auth/account/route";
import { GET as EXPORT } from "@/app/api/auth/export/route";
import { POST as CREATE_APP } from "@/app/api/applications/route";
import { POST as REGISTER } from "@/app/api/auth/register/route";
import { GET as VERIFY_EMAIL } from "@/app/api/auth/verify-email/route";
import { POST as RESEND_VERIFICATION } from "@/app/api/auth/resend-verification/route";
import { db } from "@/lib/db/client";
import {
  applications,
  emailVerificationTokens,
  milestones,
  users,
} from "@/lib/db/schema";
import { issueEmailVerification } from "@/lib/services/account";
import {
  authMock,
  createUser,
  jsonRequest,
  mockSession,
  readJson,
  resetDb,
} from "@/tests/helpers";

const base = "http://localhost/api/auth";

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

// Unique IP per request so the rate limiter (change-password) never trips.
let reqCounter = 0;
function req(url: string, method: string, body?: unknown) {
  reqCounter += 1;
  return jsonRequest(url, method, body, {
    "x-forwarded-for": `10.6.0.${reqCounter}`,
  });
}

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
});

describe("PATCH /api/auth/profile", () => {
  it("updates the name and email", async () => {
    const user = await createUser("old@test.dev", "Old Name");
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await PROFILE(
      req(`${base}/profile`, "PATCH", {
        name: "New Name",
        email: "new@test.dev",
      }),
    );
    expect(res.status).toBe(200);
    expect((await readJson(res)).data).toMatchObject({
      name: "New Name",
      email: "new@test.dev",
    });

    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id));
    expect(row.name).toBe("New Name");
    expect(row.email).toBe("new@test.dev");
  });

  it("rejects a duplicate email with 409", async () => {
    const user = await createUser("a@test.dev");
    await createUser("b@test.dev");
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await PROFILE(
      req(`${base}/profile`, "PATCH", { email: "b@test.dev" }),
    );
    expect(res.status).toBe(409);
    expect((await readJson(res)).code).toBe("EMAIL_TAKEN");
  });

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await PROFILE(req(`${base}/profile`, "PATCH", { name: "X" }));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/change-password", () => {
  it("changes the password when the current one is correct", async () => {
    const user = await createUser("pw@test.dev", "User", "oldpassword1");
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await CHANGE_PASSWORD(
      req(`${base}/change-password`, "POST", {
        currentPassword: "oldpassword1",
        newPassword: "newpassword1",
        confirmPassword: "newpassword1",
      }),
    );
    expect(res.status).toBe(200);

    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id));
    expect(await bcrypt.compare("newpassword1", row.passwordHash!)).toBe(true);
    expect(await bcrypt.compare("oldpassword1", row.passwordHash!)).toBe(false);
  });

  it("rejects a wrong current password", async () => {
    const user = await createUser("pw2@test.dev", "User", "oldpassword1");
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await CHANGE_PASSWORD(
      req(`${base}/change-password`, "POST", {
        currentPassword: "wrong",
        newPassword: "newpassword1",
        confirmPassword: "newpassword1",
      }),
    );
    expect(res.status).toBe(401);
    expect((await readJson(res)).code).toBe("INVALID_PASSWORD");
  });

  it("rejects a weak new password", async () => {
    const user = await createUser("pw3@test.dev");
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await CHANGE_PASSWORD(
      req(`${base}/change-password`, "POST", {
        currentPassword: "password123",
        newPassword: "short",
        confirmPassword: "short",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects mismatched confirmation passwords", async () => {
    const user = await createUser("pw4@test.dev");
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await CHANGE_PASSWORD(
      req(`${base}/change-password`, "POST", {
        currentPassword: "password123",
        newPassword: "newpassword1",
        confirmPassword: "different1",
      }),
    );
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(String(JSON.stringify(json.details ?? ""))).toContain(
      "Passwords do not match",
    );
  });
});

describe("DELETE /api/auth/account", () => {
  it("deletes the account and all of its data (cascade)", async () => {
    const user = await createUser();
    authMock.mockResolvedValueOnce(mockSession(user.id));
    await CREATE_APP(
      jsonRequest("http://localhost/api/applications", "POST", {
        company: "Acme",
        role: "Engineer",
      }),
    );

    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await DELETE_ACCOUNT();
    expect(res.status).toBe(200);

    expect(await db.select().from(users)).toHaveLength(0);
    expect(await db.select().from(applications)).toHaveLength(0);
    expect(await db.select().from(milestones)).toHaveLength(0);
  });
});

describe("GET /api/auth/export", () => {
  it("returns all data as JSON without the password hash", async () => {
    const user = await createUser("exp@test.dev", "Export User");
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const created = await CREATE_APP(
      jsonRequest("http://localhost/api/applications", "POST", {
        company: "Acme",
        role: "Engineer",
        notes: "hello",
      }),
    );
    expect(created.status).toBe(201);

    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await EXPORT();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(
      /attachment; filename="ghosted-export-/,
    );

    const json = (await res.json()) as {
      user: Record<string, unknown>;
      applications: Array<Record<string, unknown> & { milestones: unknown[] }>;
    };
    expect(json.user.email).toBe("exp@test.dev");
    expect(json.user.passwordHash).toBeUndefined();
    expect(json.applications).toHaveLength(1);
    expect(json.applications[0].company).toBe("Acme");
    expect(json.applications[0].milestones).toHaveLength(5);
  });

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await EXPORT();
    expect(res.status).toBe(401);
  });
});

describe("email verification", () => {
  it("register creates an unverified user with a verification token", async () => {
    const res = await REGISTER(
      req(`${base}/register`, "POST", {
        email: "verify@test.dev",
        password: "password123",
        name: "Verify",
      }),
    );
    expect(res.status).toBe(201);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, "verify@test.dev"));
    expect(user.emailVerified).toBe(false);

    const tokens = await db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, user.id));
    expect(tokens).toHaveLength(1);
    expect(tokens[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("verifies the email with a valid token", async () => {
    const user = await createUser("ver@test.dev");
    const { raw } = await issueEmailVerification(user.id);

    const res = await VERIFY_EMAIL(
      new Request(`${base}/verify-email?token=${raw}`),
    );
    expect(res.status).toBe(200);
    expect((await readJson(res)).email).toBe("ver@test.dev");

    const [updated] = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id));
    expect(updated.emailVerified).toBe(true);
    expect(updated.emailVerifiedAt).not.toBeNull();

    const [token] = await db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, user.id));
    expect(token.usedAt).not.toBeNull();
  });

  it("rejects an invalid, expired or reused token", async () => {
    const user = await createUser("ver2@test.dev");

    // Unknown token.
    const unknown = await VERIFY_EMAIL(
      new Request(`${base}/verify-email?token=${"x".repeat(40)}`),
    );
    expect(unknown.status).toBe(400);

    // Expired token.
    const ttl = Number(process.env.EMAIL_VERIFICATION_TTL_MINUTES ?? 1440);
    const expiredRaw = "expired-verification-token-abcdefghijklmnop";
    await db.insert(emailVerificationTokens).values({
      userId: user.id,
      tokenHash: hashToken(expiredRaw),
      expiresAt: new Date(Date.now() - 60_000),
    });
    const expired = await VERIFY_EMAIL(
      new Request(`${base}/verify-email?token=${expiredRaw}`),
    );
    expect(expired.status).toBe(400);
    expect((await readJson(expired)).code).toBe("INVALID_VERIFICATION_TOKEN");

    // Reusing an already-used token.
    const { raw } = await issueEmailVerification(user.id);
    await VERIFY_EMAIL(new Request(`${base}/verify-email?token=${raw}`));
    const reuse = await VERIFY_EMAIL(
      new Request(`${base}/verify-email?token=${raw}`),
    );
    expect(reuse.status).toBe(400);

    // Missing token.
    const missing = await VERIFY_EMAIL(new Request(`${base}/verify-email`));
    expect(missing.status).toBe(400);
  });

  it("changing the email resets verification and issues a new token", async () => {
    const user = await createUser("oldmail@test.dev", "User", "password123");
    // Verify first.
    const { raw } = await issueEmailVerification(user.id);
    await VERIFY_EMAIL(new Request(`${base}/verify-email?token=${raw}`));

    // Change the email → becomes unverified with a fresh token.
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await PROFILE(
      req(`${base}/profile`, "PATCH", { email: "newmail@test.dev" }),
    );
    expect(res.status).toBe(200);

    const [updated] = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id));
    expect(updated.emailVerified).toBe(false);
    expect(updated.emailVerifiedAt).toBeNull();

    const tokens = await db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, user.id));
    expect(tokens).toHaveLength(1);
  });

  it("resend-verification requires a session and creates a new token", async () => {
    // Unauthenticated.
    authMock.mockResolvedValueOnce(null);
    const unauth = await RESEND_VERIFICATION(new Request(`${base}/resend-verification`, { method: "POST" }));
    expect(unauth.status).toBe(401);

    // Authenticated.
    const user = await createUser("resend@test.dev");
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await RESEND_VERIFICATION(
      jsonRequest(`${base}/resend-verification`, "POST", undefined, {
        "x-forwarded-for": "10.6.0.99",
      }),
    );
    expect(res.status).toBe(200);

    const tokens = await db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, user.id));
    expect(tokens).toHaveLength(1);
  });
});
