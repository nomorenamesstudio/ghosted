import { describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: { execute: vi.fn() } }));

import { db } from "@/lib/db/client";
import { GET } from "@/app/api/health/route";

/**
 * A container probe reads this and nothing else, so the two answers it can give
 * are the contract: "up and the database answered", or "up but the database did
 * not" — which is the failure a process check cannot see.
 */
describe("GET /api/health", () => {
  it("reports a reachable database", async () => {
    (db.execute as Mock).mockResolvedValueOnce([{ "?column?": 1 }]);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toMatchObject({
      ok: true,
      database: "up",
    });
  });

  it("does not publish the running version", async () => {
    // This endpoint is public and unauthenticated, so the version was a free
    // answer to "which advisories apply to you?" (2026-10-14 pentest, finding 5).
    (db.execute as Mock).mockResolvedValueOnce([{ "?column?": 1 }]);

    const body = (await (await GET()).json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("version");
  });

  it("answers 503 when the deployment configuration is invalid", async () => {
    // The config is validated at request time now, so a process can be running
    // with a broken deployment: a probe that says "healthy" would be lying.
    (db.execute as Mock).mockResolvedValueOnce([{ "?column?": 1 }]);
    const previous = process.env.ALLOW_REGISTRATION;
    process.env.ALLOW_REGISTRATION = "flase";
    try {
      const res = await GET();
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ ok: false, config: "invalid" });
    } finally {
      if (previous === undefined) delete process.env.ALLOW_REGISTRATION;
      else process.env.ALLOW_REGISTRATION = previous;
    }
  });

  it("answers 503 when the database is unreachable", async () => {
    (db.execute as Mock).mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, database: "down" });
  });
});
