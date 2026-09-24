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
  createApplication,
  getApplication,
  listApplications,
  resetTimeline,
  updateMilestone,
} from "@/lib/services/applications";
import { DEFAULT_MILESTONE_TITLES } from "@/lib/utils/reorder";
import { resetDb, createUser } from "../helpers";

/**
 * "Reset the timeline" is offered when a card is dragged back from Interviewing
 * to Applied, and it has to land *on* the application, not before it.
 *
 * It used to clear every step, so an application sitting in Applied read as
 * though it had never been sent and its progress was 0% for a process that had
 * at least started. The first step (titled "Application") stays done now, and
 * everything after it goes back to pending.
 */
describe("resetting the timeline stops at the application", () => {
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

  async function markDone(position: number) {
    const app = await getApplication(userId, applicationId);
    const step = app!.milestones[position];
    await updateMilestone(userId, step.id, { status: "done" });
  }

  it("keeps the application step done and clears the rest", async () => {
    // Two steps done: that is what makes it "interviewing".
    await markDone(0);
    await markDone(1);

    const before = await getApplication(userId, applicationId);
    expect(before!.status).toBe("interviewing");

    const result = await resetTimeline(userId, applicationId);
    expect(result).not.toBeNull();

    const after = await getApplication(userId, applicationId);
    expect(after!.status).toBe("applied");
    expect(after!.milestones[0].title).toBe(DEFAULT_MILESTONE_TITLES[0]);
    expect(after!.milestones[0].status).toBe("done");
    expect(
      after!.milestones.slice(1).every((m) => m.status === "pending"),
    ).toBe(true);
    expect(after!.milestones.slice(1).every((m) => m.date === null)).toBe(true);

    // Progress reflects the one step still standing rather than reading zero.
    const list = await listApplications(userId, {
      status: "applied",
      page: 1,
      limit: 20,
    });
    const reset = list.data.find((a) => a.id === applicationId)!;
    expect(reset.progress).toBe(Math.round(100 / after!.milestones.length));
  });

  it("leaves a single-step timeline done rather than empty", async () => {
    await markDone(0);

    await resetTimeline(userId, applicationId);

    const after = await getApplication(userId, applicationId);
    expect(after!.milestones).toHaveLength(DEFAULT_MILESTONE_TITLES.length);
    expect(after!.milestones[0].status).toBe("done");
    expect(after!.status).toBe("applied");
  });
});
