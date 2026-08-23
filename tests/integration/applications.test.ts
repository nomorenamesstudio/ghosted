import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("rejects missing required fields", async () => {
    const user = await createUser();
    authMock.mockResolvedValueOnce(mockSession(user.id));
    const res = await POST(jsonRequest(base, "POST", { company: "No role" }));
    expect(res.status).toBe(400);
    const json = await readJson(res);
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
        contact: "Jane",
        status: "rejected",
      }),
      { params: { id: app.id } },
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect((json.data as Record<string, unknown>).company).toBe("NewCo");
    expect((json.data as Record<string, unknown>).status).toBe("rejected");
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
});
