import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  BCRYPT_ROUNDS: 12,
  SESSION_IDLE_SECONDS: 0,
  SESSION_ABSOLUTE_SECONDS: 0,
}));

import { GET } from "@/app/api/applications/match/route";
import {
  createApplication,
  softDeleteApplication,
  updateApplication,
} from "@/lib/services/applications";
import {
  authMock,
  createUser,
  mockSession,
  readJson,
  resetDb,
} from "@/tests/helpers";

/**
 * "This is already on your board."
 *
 * The pre-check the add form runs before it writes. It must not be a gate — the
 * user can always file a second row — so what it owes them is an honest answer:
 * the rows that match, and whether any of them is still live. A rejected or
 * archived match is a legitimate reapplication, and the form's wording depends
 * on that distinction, which is what `verdict` exists for.
 */
const base = "http://localhost/api/applications/match";

async function check(params: Record<string, string>) {
  authMock.mockResolvedValueOnce(mockSession(userId));
  const res = await GET(new Request(`${base}?${new URLSearchParams(params)}`));
  return { status: res.status, body: await readJson(res) };
}

let userId: string;

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
  userId = (await createUser()).id;
});

describe("GET /api/applications/match", () => {
  it("answers none when the board has nothing like it", async () => {
    const { status, body } = await check({
      company: "Stripe",
      role: "Design Engineer",
    });
    expect(status).toBe(200);
    expect(body.data).toEqual({ matches: [], verdict: "none" });
  });

  it("calls a live match active, and reports the row", async () => {
    await createApplication(userId, {
      company: "Stripe",
      role: "Design Engineer",
      url: "https://stripe.com/jobs/1",
    });

    const { body } = await check({
      company: "stripe ",
      role: "design engineer",
    });
    const data = body.data as {
      verdict: string;
      matches: Array<{ company: string; status: string }>;
    };
    expect(data.verdict).toBe("active");
    expect(data.matches).toHaveLength(1);
    expect(data.matches[0]).toMatchObject({
      company: "Stripe",
      status: "applied",
    });
  });

  it("calls a rejected or archived match closed, because a reapplication is real", async () => {
    const app = await createApplication(userId, {
      company: "Figma",
      role: "Designer",
    });
    await updateApplication(userId, app.id, { status: "rejected" });

    const rejected = await check({ company: "Figma", role: "Designer" });
    expect((rejected.body.data as { verdict: string }).verdict).toBe("closed");

    await updateApplication(userId, app.id, { status: "applied" });
    await softDeleteApplication(userId, app.id);
    const archived = await check({ company: "Figma", role: "Designer" });
    expect((archived.body.data as { verdict: string }).verdict).toBe("closed");
  });

  it("matches on the posting URL even when the role was reworded", async () => {
    await createApplication(userId, {
      company: "Vercel",
      role: "Design Engineer",
      url: "https://vercel.com/careers/1",
    });

    const { body } = await check({
      url: "http://www.vercel.com/careers/1/?utm_source=linkedin",
    });
    const data = body.data as { verdict: string; matches: unknown[] };
    expect(data.verdict).toBe("active");
    expect(data.matches).toHaveLength(1);
  });

  it("never shows another account's applications", async () => {
    const other = await createUser();
    await createApplication(other.id, { company: "Linear", role: "Engineer" });

    const { body } = await check({ company: "Linear", role: "Engineer" });
    expect(body.data).toEqual({ matches: [], verdict: "none" });
  });

  it("needs a URL, or a company and a role", async () => {
    authMock.mockResolvedValueOnce(mockSession(userId));
    const res = await GET(new Request(`${base}?company=Stripe`));
    expect(res.status).toBe(400);
  });
});
