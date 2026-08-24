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

import { POST } from "@/app/api/applications/route";
import {
  PATCH as PATCH_APP,
  DELETE as DELETE_APP,
} from "@/app/api/applications/[id]/route";
import { PATCH as PATCH_MILESTONE } from "@/app/api/milestones/[id]/route";
import { GET as GET_STATS } from "@/app/api/dashboard/stats/route";
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

async function createApp(userId: string, company: string) {
  authMock.mockResolvedValueOnce(mockSession(userId));
  const res = await POST(
    jsonRequest(`${base}/applications`, "POST", {
      company,
      role: "Engineer",
    }),
  );
  const json = await readJson(res);
  return json.data as Record<string, any>;
}

async function milestoneAtStep(appId: string, stepOrder: number) {
  const [m] = await db
    .select()
    .from(milestones)
    .where(eq(milestones.applicationId, appId))
    .orderBy(milestones.stepOrder)
    .limit(1)
    .offset(stepOrder);
  return m!;
}

async function patchMilestone(userId: string, milestoneId: string, status: string) {
  authMock.mockResolvedValueOnce(mockSession(userId));
  return PATCH_MILESTONE(
    jsonRequest(`${base}/milestones/${milestoneId}`, "PATCH", { status }),
    { params: { id: milestoneId } },
  );
}

async function getStats(userId: string) {
  authMock.mockResolvedValueOnce(mockSession(userId));
  const res = await GET_STATS();
  expect(res.status).toBe(200);
  const json = await readJson(res);
  return json.data as Record<string, number>;
}

describe("GET /api/dashboard/stats", () => {
  it("returns 401 without a session", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await GET_STATS();
    expect(res.status).toBe(401);
  });

  it("counts applications by derived status", async () => {
    const user = await createUser();

    // 1. Fresh app → applied (active).
    await createApp(user.id, "Acme");

    // 2. Complete Technical Interview → interviewing (active).
    const interviewing = await createApp(user.id, "Globex");
    const ti = await milestoneAtStep(interviewing.id, 2);
    await patchMilestone(user.id, ti.id, "done");

    // 3. Complete everything → offer.
    const offer = await createApp(user.id, "Initech");
    const offerMs = await db
      .select()
      .from(milestones)
      .where(eq(milestones.applicationId, offer.id));
    for (const m of offerMs) {
      await patchMilestone(user.id, m.id, "done");
    }

    // 4. Manually rejected.
    const rejected = await createApp(user.id, "Umbrella");
    authMock.mockResolvedValueOnce(mockSession(user.id));
    await PATCH_APP(
      jsonRequest(`${base}/applications/${rejected.id}`, "PATCH", {
        status: "rejected",
      }),
      { params: { id: rejected.id } },
    );

    // 5. Archived → excluded from every stat.
    const archived = await createApp(user.id, "Hooli");
    authMock.mockResolvedValueOnce(mockSession(user.id));
    await DELETE_APP(new Request(`${base}/applications/${archived.id}`), {
      params: { id: archived.id },
    });

    const stats = await getStats(user.id);
    expect(stats.total).toBe(4);
    expect(stats.active).toBe(2);
    expect(stats.interviewing).toBe(1);
    expect(stats.offers).toBe(1);
    expect(stats.rejected).toBe(1);
    expect(stats.ghosted).toBe(0);
  });

  it("flags stale applications as ghosted", async () => {
    const user = await createUser();
    const app = await createApp(user.id, "StaleCo");

    // Simulate 15 days without updates (threshold is 14 days).
    const old = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    await db
      .update(applications)
      .set({ updatedAt: old })
      .where(eq(applications.id, app.id));

    const stats = await getStats(user.id);
    expect(stats.ghosted).toBe(1);
    expect(stats.active).toBe(0);
    expect(stats.total).toBe(1);
  });

  it("does not count a recently updated application as ghosted", async () => {
    const user = await createUser();
    await createApp(user.id, "FreshCo");
    const stats = await getStats(user.id);
    expect(stats.ghosted).toBe(0);
    expect(stats.active).toBe(1);
  });
});
