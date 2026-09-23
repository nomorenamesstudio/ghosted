import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  BCRYPT_ROUNDS: 12,
  SESSION_IDLE_SECONDS: 0,
  SESSION_ABSOLUTE_SECONDS: 0,
}));

import { createApplication, listApplications } from "@/lib/services/applications";
import { resetDb, createUser } from "../helpers";

/**
 * The list payload is a contract with the card: it sends exactly what a card
 * renders and nothing else.
 *
 * It used to send the whole `applications` row plus derived fields — notes, the
 * three contact fields, userId, createdAt, archivedFromStatus — which is 38% more
 * JSON per board load for data no card reads. That is easy to reintroduce by
 * accident (a `select()` instead of a column list, or an extra spread), and no
 * other test would notice: the extra fields are simply ignored by the UI.
 */
const CARD_FIELDS = [
  "company",
  "companyWebsite",
  "currentRound",
  "displayStatus",
  "id",
  "isFavorite",
  "milestoneCount",
  "progress",
  "role",
  "status",
  "totalSteps",
  "updatedAt",
  "url",
];

describe("the list payload stays the card's contract", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("sends exactly the fields a card renders", async () => {
    const user = await createUser();
    await createApplication(user.id, {
      company: "Acme Corp",
      role: "Engineer",
      notes: "Recruiter said they would call back",
      contactName: "Sam",
      contactEmail: "sam@acme.test",
      contactPhone: "+661234567",
    });

    const result = await listApplications(user.id, {
      status: "applied",
      sort: "updated_at",
      page: 1,
      limit: 20,
    });

    expect(result.data).toHaveLength(1);
    const item = result.data[0];

    // The card's fields are present…
    for (const field of CARD_FIELDS) {
      expect(item, `missing ${field}`).toHaveProperty(field);
    }
    // …and nothing else is. A new field here means the query and the card
    // disagree, which is the drift this test exists to catch.
    expect(Object.keys(item).sort()).toEqual(CARD_FIELDS);

    // The detail path still hands out the whole row, notes and contacts included.
    expect(item).not.toHaveProperty("notes");
    expect(item).not.toHaveProperty("contactEmail");
    expect(item).not.toHaveProperty("userId");
  });

  it("keeps the derived fields the card's maths needs", async () => {
    const user = await createUser();
    await createApplication(user.id, { company: "Acme Corp", role: "Engineer" });

    const result = await listApplications(user.id, {
      status: "applied",
      sort: "updated_at",
      page: 1,
      limit: 20,
    });
    const item = result.data[0];

    // progress/currentRound/milestoneCount are computed from the milestones the
    // query joins in; if that join narrows too far, they silently go wrong.
    expect(item.milestoneCount).toBeGreaterThan(0);
    expect(item.progress).toBeGreaterThanOrEqual(0);
    expect(item.progress).toBeLessThanOrEqual(100);
    expect(item.totalSteps).toBeGreaterThan(0);
    expect(item.displayStatus).toBe("applied");
  });
});
