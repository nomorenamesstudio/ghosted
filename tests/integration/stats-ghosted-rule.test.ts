import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  BCRYPT_ROUNDS: 12,
  SESSION_IDLE_SECONDS: 0,
  SESSION_ABSOLUTE_SECONDS: 0,
}));

import { db } from "@/lib/db/client";
import { applications, users } from "@/lib/db/schema";
import { getStats } from "@/lib/services/applications";
import { displayStatusOf, ghostedAfterDays } from "@/lib/utils/status";
import type { ApplicationStatus } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resetDb, createUser } from "../helpers";

/**
 * The dashboard's stat cards are counted in SQL, while the columns, the list and
 * the cards decide "ghosted" in JavaScript. The two must agree, and they did not:
 * the first version of the aggregate counted only applied/interviewing rows that
 * had gone quiet, so an application filed as ghosted *by hand* was missing from
 * the stat card while sitting in the ghosted column — the count read 8 above a
 * column of 9.
 *
 * So this asserts the invariant directly: build a set of applications that
 * covers every branch (both kinds of ghosted, the patience boundary, archived),
 * compute what the cards should say using the same rule the board uses, and
 * compare with the SQL aggregate.
 */
const THRESHOLD_DAYS = 10; // "realistic", set explicitly below
const DAY = 24 * 60 * 60 * 1000;

async function seedApplications(
  userId: string,
  rows: Array<{ status: ApplicationStatus; daysAgo: number }>,
) {
  for (const row of rows) {
    await db.insert(applications).values({
      userId,
      company: `Co ${Math.random().toString(36).slice(2, 7)}`,
      role: "Engineer",
      status: row.status as ApplicationStatus,
      updatedAt: new Date(Date.now() - row.daysAgo * DAY),
    });
  }
}

describe("dashboard stats agree with the JS ghosted rule", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("counts both hand-filed and time-derived ghosted applications", async () => {
    const user = await createUser();
    await db
      .update(users)
      .set({ patienceLevel: "realistic" })
      .where(eq(users.id, user.id));

    // Fresh and stale applied/interviewing, a hand-filed ghosted row, the other
    // statuses, and one archived that must not appear anywhere.
    await seedApplications(user.id, [
      { status: "applied", daysAgo: 1 },
      { status: "applied", daysAgo: THRESHOLD_DAYS + 5 },
      { status: "interviewing", daysAgo: 2 },
      { status: "interviewing", daysAgo: THRESHOLD_DAYS + 1 },
      { status: "ghosted", daysAgo: 1 },
      { status: "offer", daysAgo: 3 },
      { status: "rejected", daysAgo: 4 },
      { status: "archived", daysAgo: 1 },
    ]);

    // What the board shows: the same rule, applied to the same rows in JS.
    const rows = await db
      .select({
        status: applications.status,
        updatedAt: applications.updatedAt,
      })
      .from(applications)
      .where(eq(applications.userId, user.id));

    const days = ghostedAfterDays("realistic");
    const expected = {
      total: 0,
      active: 0,
      interviewing: 0,
      offers: 0,
      rejected: 0,
      ghosted: 0,
    };
    for (const row of rows) {
      if (row.status === "archived") continue;
      expected.total += 1;
      const display = displayStatusOf(
        row.status as ApplicationStatus,
        row.updatedAt,
        days,
      );
      if (display === "ghosted") expected.ghosted += 1;
      if (display === "interviewing") expected.interviewing += 1;
      if (display === "offer") expected.offers += 1;
      if (display === "rejected") expected.rejected += 1;
      if (display === "applied" || display === "interviewing") expected.active += 1;
    }

    // A real disagreement, not a tautology: 8 rows were seeded, 1 is archived,
    // and 3 of the remaining 7 are ghosted — two by age, one by hand.
    expect(expected.total).toBe(7);
    expect(expected.ghosted).toBe(3);
    expect(await getStats(user.id)).toEqual(expected);
  });

  it("puts the patience threshold in the same place as the board", async () => {
    const user = await createUser();
    await db
      .update(users)
      .set({ patienceLevel: "impatient" }) // 7 days
      .where(eq(users.id, user.id));

    const threshold = ghostedAfterDays("impatient");
    await seedApplications(user.id, [
      // Just inside the window, and just outside it.
      { status: "applied", daysAgo: threshold - 0.5 },
      { status: "applied", daysAgo: threshold + 0.5 },
    ]);

    const stats = await getStats(user.id);
    expect(stats.total).toBe(2);
    expect(stats.active).toBe(1);
    expect(stats.ghosted).toBe(1);
  });
});
