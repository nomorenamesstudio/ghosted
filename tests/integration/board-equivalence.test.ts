import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  BCRYPT_ROUNDS: 12,
  SESSION_INVALIDATE_SECONDS: 0,
  SESSION_ABSOLUTE_SECONDS: 0,
}));

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { applications } from "@/lib/db/schema";
import { createApplication, listApplications, listBoard } from "@/lib/services/applications";
import { STATUS_ORDER, type DisplayStatus } from "@/lib/utils/status";
import { resetDb, createUser } from "../helpers";

/**
 * `listBoard` is the six per-status requests collapsed into one partitioned
 * query. This is the check that makes that claim safe: for every section, its
 * cards — in order — and its total must equal what the per-status endpoint
 * returns for the same filters.
 *
 * A board that quietly disagreed with the endpoint behind "load more" would show
 * a section header that does not match its own column, or drop cards on page two.
 * The seed below covers the cases where the two could diverge: an application
 * stale past the patience window (displayed as ghosted, stored as applied), one
 * filed as ghosted by hand, and an archived one.
 */
const DAY = 24 * 60 * 60 * 1000;

async function seedBoard(userId: string) {
  const fresh = await createApplication(userId, {
    company: "Fresh Co",
    role: "Engineer",
  });
  const stale = await createApplication(userId, {
    company: "Stale Co",
    role: "Designer",
  });
  const handFiled = await createApplication(userId, {
    company: "Handfiled Co",
    role: "PM",
  });

  await db
    .update(applications)
    .set({ updatedAt: new Date(Date.now() - 40 * DAY) })
    .where(eqId(stale.id));
  await db
    .update(applications)
    .set({ status: "ghosted" })
    .where(eqId(handFiled.id));

  // A favourite, so the shared sort's favourite-first rule is exercised too.
  await db
    .update(applications)
    .set({ isFavorite: true })
    .where(eqId(fresh.id));

  return { fresh, stale, handFiled };
}

function eqId(id: string) {
  return eq(applications.id, id);
}

describe("the board query agrees with the per-status endpoint", () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await createUser();
    userId = user.id;
  });

  for (const sort of ["updated_at", "company", "status", "progress"] as const) {
    it(`matches section by section for sort=${sort}`, async () => {
      await seedBoard(userId);

      const sections = await listBoard(userId, { sort });
      // Every display status gets a section, even the empty ones — the board
      // renders a column for each.
      expect(Object.keys(sections).sort()).toEqual([...STATUS_ORDER].sort());

      for (const status of STATUS_ORDER) {
        const perStatus = await listApplications(userId, {
          status: status as DisplayStatus,
          sort,
          page: 1,
          limit: 50,
        });

        expect(sections[status].data.map((a) => a.id), `${status} cards`).toEqual(
          perStatus.data.map((a) => a.id),
        );
        expect(sections[status].pagination.total, `${status} total`).toBe(
          perStatus.pagination.total,
        );
        expect(sections[status].pagination.totalPages).toBe(
          perStatus.pagination.totalPages,
        );
      }
    });
  }

  it("applies the search filter the same way", async () => {
    await seedBoard(userId);

    const sections = await listBoard(userId, { search: "stale" });
    const perStatus = await listApplications(userId, {
      status: "ghosted",
      search: "stale",
      page: 1,
      limit: 50,
    });

    expect(sections.ghosted.data.map((a) => a.id)).toEqual(
      perStatus.data.map((a) => a.id),
    );
    expect(sections.ghosted.pagination.total).toBe(perStatus.pagination.total);
    // Nothing else matches "stale".
    for (const status of STATUS_ORDER) {
      if (status === "ghosted") continue;
      expect(sections[status].data, `${status} should be empty`).toHaveLength(0);
    }
  });

  it("caps each section at its own limit", async () => {
    for (let i = 0; i < 5; i++) {
      await createApplication(userId, {
        company: `Co ${i}`,
        role: "Engineer",
      });
    }

    const sections = await listBoard(userId, { limit: 2 });
    expect(sections.applied.data).toHaveLength(2);
    // The cap is per section, not over the whole result: the total still counts
    // everything the section holds.
    expect(sections.applied.pagination.total).toBe(5);
    expect(sections.applied.pagination.totalPages).toBe(3);
  });
});
