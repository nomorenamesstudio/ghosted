import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { db } from "@/lib/db/client";
import { applications, milestones, users } from "@/lib/db/schema";
import {
  authMock,
  createUser,
  jsonRequest,
  mockSession,
  readJson,
  resetDb,
} from "@/tests/helpers";

const base = "http://localhost/api/auth";

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
      }),
    );
    expect(res.status).toBe(400);
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
