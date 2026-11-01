import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  BCRYPT_ROUNDS: 12,
  SESSION_IDLE_SECONDS: 0,
  SESSION_ABSOLUTE_SECONDS: 0,
}));

import { GET } from "@/app/api/applications/revision/route";
import {
  createApplication,
  softDeleteApplication,
  updateApplication,
  updateMilestone,
  getApplication,
} from "@/lib/services/applications";
import {
  authMock,
  createUser,
  mockSession,
  readJson,
  resetDb,
} from "@/tests/helpers";

/**
 * What an open board watches.
 *
 * The contract is narrow and that is the point: the value must move on anything
 * that changes the board (a new application, a status change, a milestone
 * finished, an archive) and must not move when two polls see the same data — a
 * revision that drifts on its own would make every open tab refetch forever.
 */
const base = "http://localhost/api/applications/revision";

async function revision() {
  authMock.mockResolvedValueOnce(mockSession(userId));
  const { body } = await readJson(await GET()).then((data) => ({ body: data }));
  return (body.data as { revision: string }).revision;
}

let userId: string;
let applicationId: string;

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
  userId = (await createUser()).id;
  const app = await createApplication(userId, {
    company: "Stripe",
    role: "Design Engineer",
  });
  applicationId = app.id;
});

describe("GET /api/applications/revision", () => {
  it("is stable between reads while nothing changes", async () => {
    const first = await revision();
    const second = await revision();
    expect(second).toBe(first);
  });

  it("moves when an application is added", async () => {
    const before = await revision();
    await createApplication(userId, { company: "Figma", role: "Designer" });
    expect(await revision()).not.toBe(before);
  });

  it("moves when a status changes, and when a milestone is finished", async () => {
    const before = await revision();
    await updateApplication(userId, applicationId, { status: "rejected" });
    const afterStatus = await revision();
    expect(afterStatus).not.toBe(before);

    const app = await getApplication(userId, applicationId);
    await updateMilestone(userId, app!.milestones[1].id, { status: "done" });
    expect(await revision()).not.toBe(afterStatus);
  });

  it("moves when the favorite flag is toggled", async () => {
    const before = await revision();
    const { toggleFavorite } = await import("@/lib/services/applications");
    await toggleFavorite(userId, applicationId);
    expect(await revision()).not.toBe(before);
  });

  it("moves when an application is archived", async () => {
    const before = await revision();
    await softDeleteApplication(userId, applicationId);
    expect(await revision()).not.toBe(before);
  });

  it("does not leak another account's changes", async () => {
    const other = await createUser();
    const mine = await revision();
    await createApplication(other.id, { company: "Linear", role: "Engineer" });
    expect(await revision()).toBe(mine);
  });

  it("requires a session", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
