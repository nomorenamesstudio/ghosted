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
  it("reports the version and a reachable database", async () => {
    (db.execute as Mock).mockResolvedValueOnce([{ "?column?": 1 }]);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toMatchObject({
      ok: true,
      database: "up",
      version: expect.any(String),
    });
  });

  it("answers 503 when the database is unreachable", async () => {
    (db.execute as Mock).mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, database: "down" });
  });
});
