import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  BCRYPT_ROUNDS: 12,
  SESSION_IDLE_SECONDS: 0,
  SESSION_ABSOLUTE_SECONDS: 0,
}));

import {
  addMilestone,
  createApplication,
  deleteMilestone,
  getApplication,
  updateMilestone,
} from "@/lib/services/applications";
import { resetDb, createUser } from "../helpers";

/**
 * The timeline's ordering invariants, after the three rewriting loops became
 * single statements.
 *
 * Inserting, deleting and re-marking used to issue one UPDATE per moved row;
 * they now use one range UPDATE (or one CASE) each. The SQL is only equivalent
 * if the rows really are contiguous and the invariants hold afterwards, so this
 * asserts the rules rather than the implementation: step orders are always a
 * gapless 0..n-1, and done milestones always precede pending ones.
 */
async function stepOrders(userId: string, applicationId: string) {
  const app = await getApplication(userId, applicationId);
  if (!app) throw new Error("application vanished");
  return {
    orders: app.milestones.map((m) => m.stepOrder),
    statuses: app.milestones.map((m) => m.status),
    titles: app.milestones.map((m) => m.title),
  };
}

function expectGapless(orders: number[]) {
  expect(orders).toEqual(Array.from({ length: orders.length }, (_, i) => i));
}

describe("milestone ordering survives the batched rewrites", () => {
  let userId: string;
  let applicationId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await createUser();
    userId = user.id;
    const app = await createApplication(userId, {
      company: "Acme Corp",
      role: "Engineer",
    });
    applicationId = app.id;
  });

  it("keeps a gapless order when inserting at a position and appending", async () => {
    const before = await stepOrders(userId, applicationId);
    expectGapless(before.orders);
    const seeded = before.orders.length;

    // Insert at the very front: every existing row shifts up by one.
    expect(
      await addMilestone(userId, applicationId, {
        title: "Prep call",
        position: 0,
      }),
    ).not.toBeNull();

    const afterHead = await stepOrders(userId, applicationId);
    expect(afterHead.orders).toHaveLength(seeded + 1);
    expectGapless(afterHead.orders);
    expect(afterHead.titles[0]).toBe("Prep call");

    // Append: nothing shifts at all.
    await addMilestone(userId, applicationId, { title: "Offer call" });
    const afterAppend = await stepOrders(userId, applicationId);
    expect(afterAppend.orders).toHaveLength(seeded + 2);
    expectGapless(afterAppend.orders);
    expect(afterAppend.titles.at(-1)).toBe("Offer call");
  });

  it("closes the gap when a middle milestone is deleted", async () => {
    const { orders, titles } = await stepOrders(userId, applicationId);
    expectGapless(orders);
    const middle = titles.length > 2 ? 1 : 0;

    const app = await getApplication(userId, applicationId);
    const victim = app!.milestones[middle];
    expect(await deleteMilestone(userId, victim.id)).not.toBeNull();

    const after = await stepOrders(userId, applicationId);
    expect(after.orders).toHaveLength(orders.length - 1);
    expectGapless(after.orders);
    expect(after.titles).not.toContain(victim.title);
  });

  it("renumbers so done steps precede pending ones", async () => {
    const app = await getApplication(userId, applicationId);
    // Mark the last step done: the timeline has to move it ahead of the pending
    // ones, which is the reordering case (one CASE statement now).
    const last = app!.milestones.at(-1)!;
    expect(last.status).not.toBe("done");

    expect(
      await updateMilestone(userId, last.id, { status: "done" }),
    ).not.toBeNull();

    const after = await stepOrders(userId, applicationId);
    expectGapless(after.orders);
    const firstPending = after.statuses.indexOf("pending");
    if (firstPending !== -1) {
      expect(after.statuses.slice(firstPending).every((s) => s !== "done")).toBe(
        true,
      );
    }
    expect(after.statuses[0]).toBe("done");
  });
});
