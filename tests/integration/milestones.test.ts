import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  BCRYPT_ROUNDS: 12,
  SESSION_IDLE_SECONDS: 0,
  SESSION_ABSOLUTE_SECONDS: 0,
}));

import { POST } from "@/app/api/applications/route";
import {
  PATCH as PATCH_APP,
} from "@/app/api/applications/[id]/route";
import {
  POST as POST_MILESTONE,
} from "@/app/api/applications/[id]/milestones/route";
import {
  PATCH as PATCH_MILESTONE,
  DELETE as DELETE_MILESTONE,
} from "@/app/api/milestones/[id]/route";
import { db } from "@/lib/db/client";
import { applications, milestones } from "@/lib/db/schema";
import {
  authMock,
  createUser,
  jsonRequest,
  mockSession,
  readJson,
  resetDb,
} from "@/tests/helpers";

const base = "http://localhost/api";

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
});

async function createApp(userId: string) {
  authMock.mockResolvedValueOnce(mockSession(userId));
  const res = await POST(
    jsonRequest(`${base}/applications`, "POST", {
      company: "Acme Corp",
      role: "Engineer",
    }),
  );
  const json = await readJson(res);
  return json.data as Record<string, any>;
}

describe("POST /api/applications/:id/milestones", () => {
  it("appends a milestone at the end when no position is given", async () => {
    const user = await createUser();
    const app = await createApp(user.id);

    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await POST_MILESTONE(
      jsonRequest(`${base}/applications/${app.id}/milestones`, "POST", {
        title: "On-site Interview",
        comment: "Bring portfolio",
      }),
      { params: { id: app.id } },
    );
    expect(res.status).toBe(201);
    const json = await readJson(res);
    const data = json.data as Record<string, any>;
    expect(data.milestone.stepOrder).toBe(5);
    expect(data.milestone.title).toBe("On-site Interview");
    expect(data.application.totalSteps).toBe(6);
    expect(data.application.status).toBe("applied"); // nothing advanced
  });

  it("inserts at a chosen position and shifts later steps down", async () => {
    const user = await createUser();
    const app = await createApp(user.id);

    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await POST_MILESTONE(
      jsonRequest(`${base}/applications/${app.id}/milestones`, "POST", {
        title: "Recruiter Chat",
        position: 1,
      }),
      { params: { id: app.id } },
    );
    expect(res.status).toBe(201);

    const rows = await db
      .select()
      .from(milestones)
      .where(eq(milestones.applicationId, app.id))
      .orderBy(milestones.stepOrder);
    expect(rows).toHaveLength(6);
    expect(rows.map((m) => m.stepOrder)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(rows.map((m) => m.title)).toEqual([
      "Application",
      "Recruiter Chat",
      "HR Screen",
      "Technical Interview",
      "Test/Homework",
      "Offer/Decision",
    ]);
  });

  it("rejects a milestone without a title", async () => {
    const user = await createUser();
    const app = await createApp(user.id);
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await POST_MILESTONE(
      jsonRequest(`${base}/applications/${app.id}/milestones`, "POST", {}),
      { params: { id: app.id } },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for a foreign application", async () => {
    const alice = await createUser("alice@test.dev");
    const bob = await createUser("bob@test.dev");
    const app = await createApp(alice.id);
    authMock.mockResolvedValueOnce(mockSession(bob.id));
    const res = await POST_MILESTONE(
      jsonRequest(`${base}/applications/${app.id}/milestones`, "POST", {
        title: "Nope",
      }),
      { params: { id: app.id } },
    );
    expect(res.status).toBe(404);
  });
});

describe("status auto-advance", () => {
  async function statusOf(userId: string, appId: string) {
    const [row] = await db
      .select({ status: applications.status })
      .from(applications)
      .where(eq2(applications.id, appId));
    return row?.status;
  }

  it("moves applied → interviewing when a step >= 2 milestone is done", async () => {
    const user = await createUser();
    const app = await createApp(user.id);
    const ms = await db
      .select()
      .from(milestones)
      .where(eq2(milestones.applicationId, app.id));

    // Mark "Technical Interview" (step 2) as done.
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await PATCH_MILESTONE(
      jsonRequest(`${base}/milestones/${ms[2].id}`, "PATCH", { status: "done" }),
      { params: { id: ms[2].id } },
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect((json.data as Record<string, any>).application.status).toBe("interviewing");
    expect(await statusOf(user.id, app.id)).toBe("interviewing");
  });

  it("moves to offer when the final milestone is done", async () => {
    const user = await createUser();
    const app = await createApp(user.id);
    const ms = await db
      .select()
      .from(milestones)
      .where(eq2(milestones.applicationId, app.id));

    for (const m of ms) {
      authMock.mockResolvedValueOnce(mockSession(user.id));
      await PATCH_MILESTONE(
        jsonRequest(`${base}/milestones/${m.id}`, "PATCH", { status: "done" }),
        { params: { id: m.id } },
      );
    }
    expect(await statusOf(user.id, app.id)).toBe("offer");
  });

  it("keeps HR Screen done at 'applied'", async () => {
    const user = await createUser();
    const app = await createApp(user.id);
    const ms = await db
      .select()
      .from(milestones)
      .where(eq2(milestones.applicationId, app.id));

    authMock.mockResolvedValueOnce(mockSession(user.id));
    await PATCH_MILESTONE(
      jsonRequest(`${base}/milestones/${ms[1].id}`, "PATCH", { status: "done" }),
      { params: { id: ms[1].id } },
    );
    expect(await statusOf(user.id, app.id)).toBe("applied");
  });

  it("does not override a manual rejected status", async () => {
    const user = await createUser();
    const app = await createApp(user.id);
    const ms = await db
      .select()
      .from(milestones)
      .where(eq2(milestones.applicationId, app.id));

    authMock.mockResolvedValueOnce(mockSession(user.id));
    await PATCH_APP(
      jsonRequest(`${base}/applications/${app.id}`, "PATCH", { status: "rejected" }),
      { params: { id: app.id } },
    );

    // Complete everything — status must stay rejected.
    for (const m of ms) {
      authMock.mockResolvedValueOnce(mockSession(user.id));
      await PATCH_MILESTONE(
        jsonRequest(`${base}/milestones/${m.id}`, "PATCH", { status: "done" }),
        { params: { id: m.id } },
      );
    }
    expect(await statusOf(user.id, app.id)).toBe("rejected");
  });

  it("updates the application's updatedAt when milestones change", async () => {
    const user = await createUser();
    const app = await createApp(user.id);
    const ms = await db
      .select()
      .from(milestones)
      .where(eq2(milestones.applicationId, app.id));

    authMock.mockResolvedValueOnce(mockSession(user.id));
    await PATCH_MILESTONE(
      jsonRequest(`${base}/milestones/${ms[0].id}`, "PATCH", { status: "done" }),
      { params: { id: ms[0].id } },
    );

    const [row] = await db
      .select({ updatedAt: applications.updatedAt })
      .from(applications)
      .where(eq2(applications.id, app.id));
    expect(row!.updatedAt.getTime()).toBeGreaterThanOrEqual(
      new Date(app.updatedAt).getTime(),
    );
  });

  it("records today's date automatically when marked done, and stays editable", async () => {
    const user = await createUser();
    const app = await createApp(user.id);
    const ms = await db
      .select()
      .from(milestones)
      .where(eq2(milestones.applicationId, app.id));

    // The second default milestone has no date yet.
    expect(ms[1].date).toBeNull();

    // Mark done without a date → server records today.
    authMock.mockResolvedValueOnce(mockSession(user.id));
    await PATCH_MILESTONE(
      jsonRequest(`${base}/milestones/${ms[1].id}`, "PATCH", { status: "done" }),
      { params: { id: ms[1].id } },
    );
    const [afterDone] = await db
      .select()
      .from(milestones)
      .where(eq2(milestones.id, ms[1].id));
    expect(afterDone.date).not.toBeNull();

    // The date can still be edited later via the edit dialog (explicit date).
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    authMock.mockResolvedValueOnce(mockSession(user.id));
    await PATCH_MILESTONE(
      jsonRequest(`${base}/milestones/${ms[1].id}`, "PATCH", { date: future }),
      { params: { id: ms[1].id } },
    );
    const [afterEdit] = await db
      .select()
      .from(milestones)
      .where(eq2(milestones.id, ms[1].id));
    expect(afterEdit.date!.toISOString()).toBe(new Date(future).toISOString());
  });
});

describe("DELETE /api/milestones/:id", () => {
  it("removes a milestone and reorders the rest", async () => {
    const user = await createUser();
    const app = await createApp(user.id);
    const ms = await db
      .select()
      .from(milestones)
      .where(eq2(milestones.applicationId, app.id));

    // Delete "Technical Interview" (step 2).
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await DELETE_MILESTONE(
      new Request(`${base}/milestones/${ms[2].id}`),
      { params: { id: ms[2].id } },
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect((json.data as Record<string, any>).application.totalSteps).toBe(4);

    const remaining = await db
      .select()
      .from(milestones)
      .where(eq2(milestones.applicationId, app.id))
      .orderBy(milestones.stepOrder);
    expect(remaining).toHaveLength(4);
    expect(remaining.map((m) => m.stepOrder)).toEqual([0, 1, 2, 3]);
    expect(remaining.map((m) => m.title)).toEqual([
      "Application",
      "HR Screen",
      "Test/Homework",
      "Offer/Decision",
    ]);
  });

  it("returns 404 for another user's milestone", async () => {
    const alice = await createUser("alice@test.dev");
    const bob = await createUser("bob@test.dev");
    const app = await createApp(alice.id);
    const ms = await db
      .select()
      .from(milestones)
      .where(eq2(milestones.applicationId, app.id));

    authMock.mockResolvedValueOnce(mockSession(bob.id));
    const res = await DELETE_MILESTONE(
      new Request(`${base}/milestones/${ms[0].id}`),
      { params: { id: ms[0].id } },
    );
    expect(res.status).toBe(404);
  });
});

// Local helper to avoid importing drizzle's eq everywhere (keeps the SQL
// injection test intent clear in the query above as well).
import { eq as eq2 } from "drizzle-orm";
