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

import { GET, POST } from "@/app/api/applications/route";
import {
  GET as GET_APP,
  PATCH as PATCH_APP,
  DELETE as DELETE_APP,
} from "@/app/api/applications/[id]/route";
import { POST as REOPEN_APP } from "@/app/api/applications/[id]/reopen/route";
import { POST as RESET_TIMELINE } from "@/app/api/applications/[id]/milestones/reset/route";
import { POST as TOGGLE_FAVORITE } from "@/app/api/applications/[id]/favorite/route";
import { PATCH as PATCH_MILESTONE } from "@/app/api/milestones/[id]/route";
import { PATCH as PATCH_PROFILE } from "@/app/api/auth/profile/route";
import { GET as GET_STATS } from "@/app/api/dashboard/stats/route";
import { db } from "@/lib/db/client";
import { applications } from "@/lib/db/schema";
import {
  authMock,
  createUser,
  jsonRequest,
  mockSession,
  readJson,
  resetDb,
} from "@/tests/helpers";

const base = "http://localhost/api/applications";

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
});

async function createApp(userId: string, body: Record<string, unknown> = {}) {
  authMock.mockResolvedValueOnce(mockSession(userId));
  const res = await POST(
    jsonRequest(base, "POST", {
      company: "Acme Corp",
      role: "Frontend Engineer",
      ...body,
    }),
  );
  const json = await readJson(res);
  return { res, json, app: json.data as Record<string, any> };
}

describe("GET /api/applications", () => {
  it("returns 401 for unauthenticated requests", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await GET(new Request(`${base}?page=1`));
    expect(res.status).toBe(401);
    const json = await readJson(res);
    expect(json.code).toBe("UNAUTHORIZED");
  });

  it("lists the user's applications with progress", async () => {
    const user = await createUser();
    const { app } = await createApp(user.id);
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await GET(new Request(`${base}?page=1&limit=10`));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    const data = json.data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(1);
    expect(data[0].company).toBe("Acme Corp");
    expect(data[0].progress).toBe(20);
    expect(data[0].currentRound).toBe("Application");
    expect(data[0].milestoneCount).toBe(5);
    expect((json.pagination as Record<string, unknown>).total).toBe(1);
  });

  it("does not leak other users' applications", async () => {
    const alice = await createUser("alice@test.dev");
    const bob = await createUser("bob@test.dev");
    await createApp(alice.id);
    authMock.mockResolvedValueOnce(mockSession(bob.id));
    const res = await GET(new Request(`${base}?page=1`));
    const json = await readJson(res);
    expect((json.data as unknown[])).toHaveLength(0);
  });

  it("searches company or role case-insensitively", async () => {
    const user = await createUser();
    await createApp(user.id, { company: "Acme Corp", role: "Engineer" });
    await createApp(user.id, { company: "Globex", role: "Designer" });

    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await GET(new Request(`${base}?search=acme&page=1`));
    const json = await readJson(res);
    const data = json.data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(1);
    expect(data[0].company).toBe("Acme Corp");

    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res2 = await GET(new Request(`${base}?search=designer&page=1`));
    const json2 = await readJson(res2);
    expect((json2.data as unknown[])).toHaveLength(1);
  });

  it("filters by status", async () => {
    const user = await createUser();
    await createApp(user.id);
    const { app } = await createApp(user.id, { company: "Globex" });
    authMock.mockResolvedValueOnce(mockSession(user.id));
    await PATCH_APP(
      jsonRequest(`${base}/${app.id}`, "PATCH", { status: "rejected" }),
      { params: { id: app.id } },
    );

    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await GET(new Request(`${base}?status=rejected&page=1`));
    const json = await readJson(res);
    const data = json.data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(1);
    expect(data[0].company).toBe("Globex");
  });

  it("sorts by company", async () => {
    const user = await createUser();
    await createApp(user.id, { company: "Zebra" });
    await createApp(user.id, { company: "Apple" });
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await GET(new Request(`${base}?sort=company&page=1`));
    const json = await readJson(res);
    const data = json.data as Array<Record<string, unknown>>;
    expect(data.map((d) => d.company)).toEqual(["Apple", "Zebra"]);
  });

  it("sorts by progress (highest first)", async () => {
    const user = await createUser();
    const { app: low } = await createApp(user.id, { company: "Low" }); // 1/5 = 20%
    const { app: mid } = await createApp(user.id, { company: "Mid" });
    const { app: high } = await createApp(user.id, { company: "High" });

    const milestonesOf = async (id: string) => {
      authMock.mockResolvedValueOnce(mockSession(user.id));
      const res = await GET_APP(new Request(`${base}/${id}`), {
        params: { id },
      });
      const json = await readJson(res);
      return (json.data as { milestones: Array<{ id: string }> }).milestones;
    };

    // Complete 2 more milestones on "Mid" (3/5 = 60%).
    const midMs = await milestonesOf(mid.id);
    for (const m of midMs.slice(1, 3)) {
      authMock.mockResolvedValueOnce(mockSession(user.id));
      await PATCH_MILESTONE(
        jsonRequest(`http://localhost/api/milestones/${m.id}`, "PATCH", {
          status: "done",
        }),
        { params: { id: m.id } },
      );
    }
    // …and all remaining on "High" (5/5 = 100%).
    const highMs = await milestonesOf(high.id);
    for (const m of highMs.slice(1)) {
      authMock.mockResolvedValueOnce(mockSession(user.id));
      await PATCH_MILESTONE(
        jsonRequest(`http://localhost/api/milestones/${m.id}`, "PATCH", {
          status: "done",
        }),
        { params: { id: m.id } },
      );
    }

    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await GET(new Request(`${base}?sort=progress&page=1`));
    const data = (await readJson(res)).data as Array<Record<string, unknown>>;
    expect(data.map((d) => d.company)).toEqual(["High", "Mid", "Low"]);
    expect(data.map((d) => d.progress)).toEqual([100, 60, 20]);
  });

  it("pins favourite applications to the top of the list", async () => {
    const user = await createUser();
    const zebra = await createApp(user.id, { company: "Zebra" });
    const apple = await createApp(user.id, { company: "Apple" });

    // Favourite "Apple" (created after Zebra, so it sorts last by default).
    authMock.mockResolvedValueOnce(mockSession(user.id));
    await TOGGLE_FAVORITE(new Request(`${base}/${apple.app.id}/favorite`), {
      params: { id: apple.app.id },
    });

    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await GET(new Request(`${base}?page=1`));
    const data = (await readJson(res)).data as Array<Record<string, unknown>>;
    expect(data.map((d) => d.company)).toEqual(["Apple", "Zebra"]);
    expect(data[0].isFavorite).toBe(true);

    // Still first with sort=company.
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res2 = await GET(new Request(`${base}?sort=company&page=1`));
    const data2 = (await readJson(res2)).data as Array<Record<string, unknown>>;
    expect(data2.map((d) => d.company)).toEqual(["Apple", "Zebra"]);
  });

  it("paginates", async () => {
    const user = await createUser();
    for (let i = 0; i < 5; i++) {
      await createApp(user.id, { company: `Company ${i}` });
    }
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await GET(new Request(`${base}?page=2&limit=2`));
    const json = await readJson(res);
    const pagination = json.pagination as Record<string, unknown>;
    expect(pagination.total).toBe(5);
    expect(pagination.totalPages).toBe(3);
    expect(pagination.page).toBe(2);
    expect((json.data as unknown[])).toHaveLength(2);
  });

  it("rejects invalid query parameters", async () => {
    const user = await createUser();
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await GET(new Request(`${base}?limit=9999`));
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.code).toBe("VALIDATION_ERROR");
  });

  it("shows stale applications as ghosted and filters by it", async () => {
    const user = await createUser();
    const { app } = await createApp(user.id, { company: "StaleCo" });

    // Simulate 15 days without updates (threshold is 14 days).
    const old = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    await db
      .update(applications)
      .set({ updatedAt: old })
      .where(eq(applications.id, app.id));

    // Default list → displayed as ghosted (raw status stays applied).
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const list = await GET(new Request(`${base}?page=1`));
    const data = (await readJson(list)).data as Array<Record<string, unknown>>;
    expect(data[0].displayStatus).toBe("ghosted");
    expect(data[0].status).toBe("applied");

    // Filter status=ghosted → returns it.
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const g = await GET(new Request(`${base}?status=ghosted&page=1`));
    expect((await readJson(g)).data as unknown[]).toHaveLength(1);

    // Filter status=applied → stale one is excluded (it is ghosted now).
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const a = await GET(new Request(`${base}?status=applied&page=1`));
    expect((await readJson(a)).data as unknown[]).toHaveLength(0);

    // Any edit revives it (updated_at refreshes → no longer ghosted).
    authMock.mockResolvedValueOnce(mockSession(user.id));
    await PATCH_APP(
      jsonRequest(`${base}/${app.id}`, "PATCH", { notes: "revived" }),
      { params: { id: app.id } },
    );
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const after = await GET(new Request(`${base}?page=1`));
    const afterData = (await readJson(after)).data as Array<
      Record<string, unknown>
    >;
    expect(afterData[0].displayStatus).toBe("applied");
  });
});

describe("POST /api/applications", () => {
  it("creates an application with the default 5-step timeline", async () => {
    const user = await createUser();
    const { res, app } = await createApp(user.id);
    expect(res.status).toBe(201);

    expect(app.status).toBe("applied");
    expect(app.totalSteps).toBe(5);
    expect(app.milestones).toHaveLength(5);
    expect(app.milestones.map((m: any) => m.title)).toEqual([
      "Application",
      "HR Screen",
      "Technical Interview",
      "Test/Homework",
      "Offer/Decision",
    ]);
    // First step is done with today's date.
    expect(app.milestones[0].status).toBe("done");
    expect(app.milestones[0].date).not.toBeNull();
    expect(app.milestones[1].status).toBe("pending");
    expect(app.progress).toBe(20);

    const rows = await db.select().from(applications);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(user.id);
  });

  it("allows an unverified user exactly 3 applications, then blocks", async () => {
    const user = await createUser("cap@test.dev", "Cap", "password123", {
      emailVerified: false,
    });
    for (let i = 0; i < 3; i++) {
      const { res } = await createApp(user.id, { company: `Acme ${i}` });
      expect(res.status).toBe(201);
    }
    // 4th is blocked, even though the user is unverified.
    const { res, json } = await createApp(user.id, { company: "Too many" });
    expect(res.status).toBe(403);
    expect(json.code).toBe("EMAIL_UNVERIFIED_LIMIT");
    // Nothing was inserted.
    const rows = await db.select().from(applications);
    expect(rows).toHaveLength(3);
  });

  it("does not cap verified users", async () => {
    const user = await createUser();
    for (let i = 0; i < 5; i++) {
      const { res } = await createApp(user.id, { company: `Acme ${i}` });
      expect(res.status).toBe(201);
    }
    const rows = await db.select().from(applications);
    expect(rows).toHaveLength(5);
  });

  it("rejects missing required fields", async () => {
    const user = await createUser();
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await POST(jsonRequest(base, "POST", { company: "No role" }));
    expect(res.status).toBe(400);    const json = await readJson(res);
    expect(json.code).toBe("VALIDATION_ERROR");
  });

  it("rejects javascript: URLs", async () => {
    const user = await createUser();
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await POST(
      jsonRequest(base, "POST", {
        company: "A",
        role: "B",
        url: "javascript:alert(1)",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("sanitizes script tags out of free-text fields", async () => {
    const user = await createUser();
    const { app } = await createApp(user.id, {
      notes: 'hello <script>alert("xss")</script> world',
      company: "Acme <script>x</script>",
    });
    expect(app.notes).toBe('hello  world');
    expect(app.company).toBe("Acme");
  });
});

describe("GET/PATCH/DELETE /api/applications/:id", () => {
  it("returns 404 for an unknown or foreign application", async () => {
    const alice = await createUser("alice@test.dev");
    const bob = await createUser("bob@test.dev");
    const { app } = await createApp(alice.id);

    authMock.mockResolvedValueOnce(mockSession(bob.id));
    const res = await GET_APP(new Request(`${base}/${app.id}`), {
      params: { id: app.id },
    });
    expect(res.status).toBe(404);

    authMock.mockResolvedValueOnce(mockSession(alice.id));
    const res2 = await GET_APP(new Request(`${base}/00000000-0000-4000-8000-000000000000`), {
      params: { id: "00000000-0000-4000-8000-000000000000" },
    });
    expect(res2.status).toBe(404);
  });

  it("returns 404 for a malformed id", async () => {
    const user = await createUser();
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await GET_APP(new Request(`${base}/not-a-uuid`), {
      params: { id: "not-a-uuid" },
    });
    expect(res.status).toBe(404);
  });

  it("gets a single application with its milestones", async () => {
    const user = await createUser();
    const { app } = await createApp(user.id);
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await GET_APP(new Request(`${base}/${app.id}`), {
      params: { id: app.id },
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    const data = json.data as Record<string, unknown>;
    expect(data.id).toBe(app.id);
    expect((data.milestones as unknown[])).toHaveLength(5);
  });

  it("patches editable fields and status", async () => {
    const user = await createUser();
    const { app } = await createApp(user.id);
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await PATCH_APP(
      jsonRequest(`${base}/${app.id}`, "PATCH", {
        company: "NewCo",
        contactName: "Jane Doe",
        contactEmail: "jane@acme.example",
        contactPhone: "+1-555-0100",
        status: "rejected",
      }),
      { params: { id: app.id } },
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect((json.data as Record<string, unknown>).company).toBe("NewCo");
    expect((json.data as Record<string, unknown>).contactName).toBe("Jane Doe");
    expect((json.data as Record<string, unknown>).contactEmail).toBe(
      "jane@acme.example",
    );
    expect((json.data as Record<string, unknown>).contactPhone).toBe(
      "+1-555-0100",
    );
    expect((json.data as Record<string, unknown>).status).toBe("rejected");
  });

  it("rejects an invalid contact email in the patch", async () => {
    const user = await createUser();
    const { app } = await createApp(user.id);
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await PATCH_APP(
      jsonRequest(`${base}/${app.id}`, "PATCH", {
        contactEmail: "not-an-email",
      }),
      { params: { id: app.id } },
    );
    expect(res.status).toBe(400);
  });

  it("rejects an invalid status in the patch", async () => {
    const user = await createUser();
    const { app } = await createApp(user.id);
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await PATCH_APP(
      jsonRequest(`${base}/${app.id}`, "PATCH", { status: "banana" }),
      { params: { id: app.id } },
    );
    expect(res.status).toBe(400);
  });

  it("soft-deletes (archives) an application", async () => {
    const user = await createUser();
    const { app } = await createApp(user.id);

    authMock.mockResolvedValueOnce(mockSession(user.id));
    const del = await DELETE_APP(new Request(`${base}/${app.id}`), {
      params: { id: app.id },
    });
    expect(del.status).toBe(204);

    // Hidden from the default list…
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const list = await GET(new Request(`${base}?page=1`));
    const listJson = await readJson(list);
    expect((listJson.data as unknown[])).toHaveLength(0);

    // …but still in the DB and visible via the archived filter.
    const rows = await db.select().from(applications);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("archived");

    authMock.mockResolvedValueOnce(mockSession(user.id));
    const archived = await GET(new Request(`${base}?status=archived&page=1`));
    const archivedJson = await readJson(archived);
    expect((archivedJson.data as unknown[])).toHaveLength(1);
  });

  it("reopens (un-archives) an application, restoring its previous status", async () => {
    const user = await createUser();
    const { app } = await createApp(user.id);

    // Advance to an intermediate status (as auto-advance would), then archive.
    authMock.mockResolvedValueOnce(mockSession(user.id));
    await PATCH_APP(
      jsonRequest(`${base}/${app.id}`, "PATCH", { status: "interviewing" }),
      { params: { id: app.id } },
    );
    authMock.mockResolvedValueOnce(mockSession(user.id));
    await DELETE_APP(new Request(`${base}/${app.id}`), {
      params: { id: app.id },
    });

    // Hidden after archiving…
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const list = await GET(new Request(`${base}?page=1`));
    expect((await readJson(list)).data as unknown[]).toHaveLength(0);

    // …reopen restores 'interviewing', not a generic 'applied'.
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await REOPEN_APP(new Request(`${base}/${app.id}/reopen`), {
      params: { id: app.id },
    });
    expect(res.status).toBe(200);
    expect(
      (await readJson(res)).data as Record<string, unknown>,
    ).toMatchObject({ id: app.id, status: "interviewing" });

    authMock.mockResolvedValueOnce(mockSession(user.id));
    const list2 = await GET(new Request(`${base}?page=1`));
    expect((await readJson(list2)).data as unknown[]).toHaveLength(1);
  });

  it("uses the user's patience level as the ghosted threshold", async () => {
    const user = await createUser();
    const { app } = await createApp(user.id);

    // Nine days of silence: past impatient (7), still inside realistic (10)
    // and generous (14).
    await db
      .update(applications)
      .set({ updatedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000) })
      .where(eq(applications.id, app.id));

    const listed = async (status: string) => {
      authMock.mockResolvedValueOnce(mockSession(user.id));
      const res = await GET(
        new Request(`${base}?status=${status}&page=1&limit=10`),
      );
      return ((await readJson(res)).data as unknown[]).length;
    };
    const ghostedCount = async () => {
      authMock.mockResolvedValueOnce(mockSession(user.id));
      const res = await GET_STATS();
      const body = (await readJson(res)) as { data: { ghosted: number } };
      return body.data.ghosted;
    };
    const setPatience = async (level: string) => {
      authMock.mockResolvedValueOnce(mockSession(user.id));
      const res = await PATCH_PROFILE(
        jsonRequest("http://localhost/api/auth/profile", "PATCH", {
          patienceLevel: level,
        }),
      );
      expect(res.status, level).toBe(200);
    };

    // Default is realistic: nine days is not enough.
    expect(await listed("ghosted")).toBe(0);
    expect(await listed("applied")).toBe(1);
    expect(await ghostedCount()).toBe(0);

    await setPatience("impatient");
    expect(await listed("ghosted")).toBe(1);
    expect(await listed("applied")).toBe(0);
    expect(await ghostedCount()).toBe(1);

    await setPatience("generous");
    expect(await listed("ghosted")).toBe(0);
    expect(await listed("applied")).toBe(1);
    expect(await ghostedCount()).toBe(0);
  });

  it("resets a timeline: every step pending, dates cleared, status re-derived", async () => {
    const user = await createUser();
    const { app } = await createApp(user.id);

    // Advance it: two more steps done (3/5), status interviewing.
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const detail = await GET_APP(new Request(`${base}/${app.id}`), {
      params: { id: app.id },
    });
    const milestones = (
      (await readJson(detail)).data as {
        milestones: Array<{ id: string }>;
      }
    ).milestones;
    for (const m of milestones.slice(1, 3)) {
      authMock.mockResolvedValueOnce(mockSession(user.id));
      await PATCH_MILESTONE(
        jsonRequest(`http://localhost/api/milestones/${m.id}`, "PATCH", {
          status: "done",
        }),
        { params: { id: m.id } },
      );
    }

    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await RESET_TIMELINE(
      new Request(`${base}/${app.id}/milestones/reset`, { method: "POST" }),
      { params: { id: app.id } },
    );
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.data).toMatchObject({ id: app.id, status: "applied" });
    const reset = body.milestones as Array<{ status: string; date: unknown }>;
    expect(reset).toHaveLength(5);
    // Titles are kept, progress is not.
    expect(reset.every((m) => m.status === "pending" && m.date === null)).toBe(
      true,
    );
  });

  it("reopening restores a manual rejected status too", async () => {
    const user = await createUser();
    const { app } = await createApp(user.id);

    authMock.mockResolvedValueOnce(mockSession(user.id));
    await PATCH_APP(
      jsonRequest(`${base}/${app.id}`, "PATCH", { status: "rejected" }),
      { params: { id: app.id } },
    );
    authMock.mockResolvedValueOnce(mockSession(user.id));
    await DELETE_APP(new Request(`${base}/${app.id}`), {
      params: { id: app.id },
    });

    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await REOPEN_APP(new Request(`${base}/${app.id}/reopen`), {
      params: { id: app.id },
    });
    expect(res.status).toBe(200);
    expect((await readJson(res)).data as Record<string, unknown>).toMatchObject({
      id: app.id,
      status: "rejected",
    });
  });

  it("rejects reopening an application that is not archived", async () => {
    const user = await createUser();
    const { app } = await createApp(user.id);

    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await REOPEN_APP(new Request(`${base}/${app.id}/reopen`), {
      params: { id: app.id },
    });
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.code).toBe("NOT_ARCHIVED");
  });
});

describe("POST /api/applications/:id/favorite", () => {
  it("toggles the favourite flag", async () => {
    const user = await createUser();
    const { app } = await createApp(user.id);

    authMock.mockResolvedValueOnce(mockSession(user.id));
    const on = await TOGGLE_FAVORITE(
      new Request(`${base}/${app.id}/favorite`),
      { params: { id: app.id } },
    );
    expect(on.status).toBe(200);
    expect((await readJson(on)).data as Record<string, unknown>).toMatchObject({
      id: app.id,
      isFavorite: true,
    });

    authMock.mockResolvedValueOnce(mockSession(user.id));
    const off = await TOGGLE_FAVORITE(
      new Request(`${base}/${app.id}/favorite`),
      { params: { id: app.id } },
    );
    expect((await readJson(off)).data as Record<string, unknown>).toMatchObject({
      isFavorite: false,
    });
  });

  it("returns 404 for another user's application", async () => {
    const alice = await createUser("alice@test.dev");
    const bob = await createUser("bob@test.dev");
    const { app } = await createApp(alice.id);

    authMock.mockResolvedValueOnce(mockSession(bob.id));
    const res = await TOGGLE_FAVORITE(
      new Request(`${base}/${app.id}/favorite`),
      { params: { id: app.id } },
    );
    expect(res.status).toBe(404);
  });
});
