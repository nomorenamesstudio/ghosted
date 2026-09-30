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

import { POST as IMPORT } from "@/app/api/auth/import/route";
import { exportUserData } from "@/lib/services/account";
import {
  ImportError,
  importUserData,
  importFileSchema,
  type ImportFile,
} from "@/lib/services/import";
import { createApplication } from "@/lib/services/applications";
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

/**
 * Moving an account between instances has to survive the round trip and has to
 * be safe to run twice: a job hunt is the one dataset somebody cannot afford to
 * duplicate into a mess or lose halfway. The tests below drive the real service
 * and the real database, because the thing under test *is* the row shape.
 */
async function seedAccount(email: string) {
  const user = await createUser(email, "Seed Owner");
  const first = await createApplication(user.id, {
    company: "Stripe",
    role: "Senior Frontend Engineer",
    url: "https://stripe.example/jobs/1",
    notes: "recruiter call went well",
    status: "interviewing",
    totalSteps: 3,
  } as never);
  await createApplication(user.id, {
    company: "Cal.com",
    role: "Frontend Engineer",
    companyWebsite: "cal.com",
    status: "rejected",
    totalSteps: 5,
    isFavorite: true,
  } as never);
  return { user, firstId: first.id };
}

const asFile = async (userId: string): Promise<ImportFile> => {
  const data = await exportUserData(userId);
  if (!data) throw new Error("export returned nothing");
  return importFileSchema.parse(data);
};

beforeEach(async () => {
  await resetDb();
});

describe("export shape", () => {
  it("stamps the format version so an importer can refuse a newer file", async () => {
    const { user } = await seedAccount("exporter@test.dev");
    const data = await exportUserData(user.id);
    expect(data?.version).toBe(1);
    expect(data?.applications).toHaveLength(2);
    expect(data?.applications[0]).toHaveProperty("milestones");
  });
});

describe("importUserData", () => {
  it("round-trips an account into another one, remapping the owner", async () => {
    const { user: owner } = await seedAccount("owner@test.dev");
    const target = await createUser("target@test.dev");
    const file = await asFile(owner.id);

    const result = await importUserData(target.id, file);
    expect(result).toMatchObject({ mode: "merge", applications: 2, skipped: 0 });

    const rows = await db
      .select()
      .from(applications)
      .where(eq(applications.userId, target.id));
    expect(rows.map((row) => row.company).sort()).toEqual(["Cal.com", "Stripe"]);
    expect(rows.every((row) => row.userId === target.id)).toBe(true);
    // Fresh rows: the target's own, not the exporter's.
    expect(rows.some((row) => row.id === file.applications[0].id)).toBe(false);

    const importedMilestones = await db
      .select()
      .from(milestones)
      .where(eq(milestones.applicationId, rows[0].id));
    expect(importedMilestones.length).toBeGreaterThan(0);
    expect(importedMilestones.map((m) => m.stepOrder)).toEqual(
      [...importedMilestones.map((m) => m.stepOrder)].sort((a, b) => a - b),
    );
  });

  it("keeps the source account untouched", async () => {
    const { user: owner } = await seedAccount("owner-untouched@test.dev");
    const target = await createUser("target-untouched@test.dev");
    const before = await db
      .select()
      .from(applications)
      .where(eq(applications.userId, owner.id));

    await importUserData(target.id, await asFile(owner.id));

    const after = await db
      .select()
      .from(applications)
      .where(eq(applications.userId, owner.id));
    expect(after.map((row) => row.id).sort()).toEqual(
      before.map((row) => row.id).sort(),
    );
  });

  it("skips what is already there when the same file arrives twice", async () => {
    const { user: owner } = await seedAccount("owner2@test.dev");
    const target = await createUser("target2@test.dev");
    const file = await asFile(owner.id);

    await importUserData(target.id, file);
    const again = await importUserData(target.id, file);

    expect(again).toMatchObject({ applications: 0, skipped: 2 });
    const rows = await db
      .select()
      .from(applications)
      .where(eq(applications.userId, target.id));
    expect(rows).toHaveLength(2);
  });

  it("replaces the target's own applications when asked, and only those", async () => {
    const { user: owner } = await seedAccount("owner3@test.dev");
    const target = await createUser("target3@test.dev");
    const other = await createUser("bystander@test.dev");
    await createApplication(target.id, {
      company: "OldCo",
      role: "Something else",
    } as never);
    await createApplication(other.id, { company: "OtherCo", role: "Untouched" } as never);

    const result = await importUserData(target.id, await asFile(owner.id), "replace");

    expect(result).toMatchObject({ mode: "replace", applications: 2 });
    const mine = await db
      .select()
      .from(applications)
      .where(eq(applications.userId, target.id));
    expect(mine.map((row) => row.company).sort()).toEqual(["Cal.com", "Stripe"]);
    const theirs = await db
      .select()
      .from(applications)
      .where(eq(applications.userId, other.id));
    expect(theirs.map((row) => row.company)).toEqual(["OtherCo"]);
  });

  it("refuses a file from a newer format instead of guessing at it", async () => {
    const target = await createUser("target4@test.dev");
    await expect(
      importUserData(target.id, {
        version: 99,
        applications: [],
      }),
    ).rejects.toBeInstanceOf(ImportError);
  });

  it("accepts an unversioned file from before the version field existed", async () => {
    const target = await createUser("target5@test.dev");
    const result = await importUserData(target.id, {
      exportedAt: new Date().toISOString(),
      applications: [
        {
          company: "Legacy Co",
          role: "Engineer",
          status: "applied",
          isFavorite: false,
          totalSteps: 5,
          milestones: [{ stepOrder: 0, title: "Applied", status: "done" }],
        },
      ],
    } as ImportFile);

    expect(result).toMatchObject({ applications: 1, milestones: 1 });
  });
});

describe("POST /api/auth/import", () => {
  it("imports a posted export and reports what landed", async () => {
    const { user: owner } = await seedAccount("route-owner@test.dev");
    const target = await createUser("route-target@test.dev");
    const file = await exportUserData(owner.id);

    authMock.mockResolvedValueOnce(mockSession(target.id));
    const res = await IMPORT(
      jsonRequest("http://localhost/api/auth/import", "POST", file),
    );

    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toMatchObject({ ok: true, applications: 2, milestones: expect.any(Number) });
  });

  it("says so plainly when the file is not JSON at all", async () => {
    const target = await createUser("route-target2@test.dev");
    authMock.mockResolvedValueOnce(mockSession(target.id));
    const res = await IMPORT(
      new Request("http://localhost/api/auth/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json {",
      }),
    );
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("INVALID_JSON");
  });

  it("rejects a well-formed JSON file that is not a Ghosted export", async () => {
    const target = await createUser("route-target3@test.dev");
    authMock.mockResolvedValueOnce(mockSession(target.id));
    const res = await IMPORT(
      jsonRequest("http://localhost/api/auth/import", "POST", { hello: "world" }),
    );
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("INVALID_IMPORT");
  });

  it("needs a session", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await IMPORT(
      jsonRequest("http://localhost/api/auth/import", "POST", { applications: [] }),
    );
    expect(res.status).toBe(401);
  });
});
