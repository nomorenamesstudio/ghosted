import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  BCRYPT_ROUNDS: 12,
  SESSION_IDLE_SECONDS: 0,
  SESSION_ABSOLUTE_SECONDS: 0,
}));

import { signIn } from "@/lib/auth";
import { POST as LOGIN } from "@/app/api/auth/login/route";
import { POST as REGISTER } from "@/app/api/auth/register/route";
import { POST as FORGOT } from "@/app/api/auth/forgot-password/route";
import { POST as RESET } from "@/app/api/auth/reset-password/route";
import { db } from "@/lib/db/client";
import {
  passwordResetTokens,
  users,
} from "@/lib/db/schema";
import {
  createUser,
  jsonRequest,
  readJson,
  resetDb,
} from "@/tests/helpers";

const base = "http://localhost/api/auth";
const ip = (n: number) => ({ "x-forwarded-for": `10.0.0.${n}` });

// Every ordinary request gets a unique IP so tests never share a rate-limit
// bucket (the limiter is process-global and persists across tests).
let reqCounter = 0;
function authRequest(url: string, method: string, body?: unknown) {
  reqCounter += 1;
  return jsonRequest(url, method, body, ip(100 + reqCounter));
}

const hashToken = (t: string) =>
  createHash("sha256").update(t).digest("hex");

beforeEach(async () => {
  await resetDb();
  vi.mocked(signIn).mockReset();
});

describe("POST /api/auth/register", () => {
  it("creates a user with a bcrypt-hashed password and auto signs in", async () => {
    vi.mocked(signIn).mockResolvedValue({ ok: true } as never);
    const res = await REGISTER(
      authRequest(`${base}/register`, "POST", {
        email: "new@test.dev",
        password: "password123",
        name: "New User",
      }),
    );
    expect(res.status).toBe(201);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, "new@test.dev"));
    expect(user).toBeDefined();
    expect(user.passwordHash).not.toBe("password123");
    expect(user.passwordHash).toMatch(/^\$2/); // bcrypt hash prefix
    expect(await bcrypt.compare("password123", user.passwordHash!)).toBe(true);
    expect(user.provider).toBe("email");

    expect(vi.mocked(signIn)).toHaveBeenCalledWith("credentials", {
      email: "new@test.dev",
      password: "password123",
      redirect: false,
    });
  });

  it("rejects duplicate emails with 409", async () => {
    await createUser("dup@test.dev");
    const res = await REGISTER(
      authRequest(`${base}/register`, "POST", {
        email: "dup@test.dev",
        password: "password123",
        name: "Dup",
      }),
    );
    expect(res.status).toBe(409);
    const json = await readJson(res);
    expect(json.code).toBe("EMAIL_TAKEN");
  });

  it("rejects weak passwords", async () => {
    const res = await REGISTER(
      authRequest(`${base}/register`, "POST", {
        email: "weak@test.dev",
        password: "short",
        name: "Weak",
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  it("returns 200 when credentials are valid", async () => {
    vi.mocked(signIn).mockResolvedValue({ ok: true } as never);
    const res = await LOGIN(
      authRequest(`${base}/login`, "POST", {
        email: "a@test.dev",
        password: "password123",
      }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 401 for invalid credentials", async () => {
    vi.mocked(signIn).mockRejectedValue(new AuthError("CredentialsSignin"));
    const res = await LOGIN(
      authRequest(`${base}/login`, "POST", {
        email: "a@test.dev",
        password: "wrongpass",
      }),
    );
    expect(res.status).toBe(401);
    const json = await readJson(res);
    expect(json.code).toBe("INVALID_CREDENTIALS");
  });

  it("rate limits after 5 attempts per IP", async () => {
    vi.mocked(signIn).mockRejectedValue(new AuthError("CredentialsSignin"));
    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await LOGIN(
        jsonRequest(
          `${base}/login`,
          "POST",
          { email: "a@test.dev", password: "bad" },
          ip(3),
        ),
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });

  it("allows a different IP after another is limited", async () => {
    vi.mocked(signIn).mockRejectedValue(new AuthError("CredentialsSignin"));
    for (let i = 0; i < 6; i++) {
      await LOGIN(
        jsonRequest(
          `${base}/login`,
          "POST",
          { email: "a@test.dev", password: "bad" },
          ip(4),
        ),
      );
    }
    // A fresh IP should still get through to the auth check.
    vi.mocked(signIn).mockResolvedValue({ ok: true } as never);
    const res = await LOGIN(
      jsonRequest(
        `${base}/login`,
        "POST",
        { email: "a@test.dev", password: "password123" },
        ip(5),
      ),
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /api/auth/forgot-password", () => {
  it("creates a reset token for an existing email and returns ok", async () => {
    const user = await createUser("reset@test.dev");
    const res = await FORGOT(
      authRequest(`${base}/forgot-password`, "POST", {
        email: "reset@test.dev",
      }),
    );
    expect(res.status).toBe(200);

    const tokens = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id));
    expect(tokens).toHaveLength(1);
    expect(tokens[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(tokens[0].usedAt).toBeNull();
  });

  it("does not leak whether an email exists", async () => {
    const res = await FORGOT(
      authRequest(`${base}/forgot-password`, "POST", {
        email: "nobody@test.dev",
      }),
    );
    expect(res.status).toBe(200);
    const all = await db.select().from(passwordResetTokens);
    expect(all).toHaveLength(0);
  });
});

describe("POST /api/auth/reset-password", () => {
  async function issueToken(userId: string, expiresAt: Date, raw: string) {
    await db.insert(passwordResetTokens).values({
      userId,
      tokenHash: hashToken(raw),
      expiresAt,
    });
  }

  it("resets the password and invalidates the token", async () => {
    const user = await createUser("resetpw@test.dev", "Reset", "oldpassword1");
    const raw = "raw-reset-token-abcdefghijklmnopqrstuvwxyz";
    await issueToken(user.id, new Date(Date.now() + 60_000), raw);

    const res = await RESET(
      authRequest(`${base}/reset-password`, "POST", {
        token: raw,
        password: "newpassword1",
      }),
    );
    expect(res.status).toBe(200);

    const [updated] = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id));
    expect(await bcrypt.compare("newpassword1", updated.passwordHash!)).toBe(true);

    const [token] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id));
    expect(token.usedAt).not.toBeNull();
  });

  it("rejects an expired token", async () => {
    const user = await createUser("expired@test.dev");
    const raw = "expired-token-abcdefghijklmnopqrstuvwxyz";
    await issueToken(user.id, new Date(Date.now() - 60_000), raw);

    const res = await RESET(
      authRequest(`${base}/reset-password`, "POST", {
        token: raw,
        password: "newpassword1",
      }),
    );
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.code).toBe("INVALID_RESET_TOKEN");
  });

  it("rejects an unknown token", async () => {
    const res = await RESET(
      authRequest(`${base}/reset-password`, "POST", {
        token: "no-such-token-abcdefghijklmnopqrstuvwxyz",
        password: "newpassword1",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects reusing a token that was already used", async () => {
    const user = await createUser("reuse@test.dev");
    const raw = "reuse-token-abcdefghijklmnopqrstuvwxyz";
    await issueToken(user.id, new Date(Date.now() + 60_000), raw);
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.userId, user.id));

    const res = await RESET(
      authRequest(`${base}/reset-password`, "POST", {
        token: raw,
        password: "newpassword1",
      }),
    );
    expect(res.status).toBe(400);
  });
});
