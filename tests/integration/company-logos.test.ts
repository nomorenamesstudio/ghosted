import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { companyLogos } from "@/lib/db/schema";
import { resolveCompanyLogo } from "@/lib/services/company-logos";

/**
 * The logo cache's two bounds.
 *
 * The cache exists to keep `/logos/:id` from hammering Google and DuckDuckGo,
 * and both of its inputs are attacker-chosen: the domain comes from a company
 * field someone typed, and the body comes from whatever those two hosts (or
 * whatever answers for them) decide to send. So the interesting contracts are
 * not "it caches a logo" but "it cannot be made to grow without one, in rows or
 * in bytes" (static audit, first pass).
 */
const NEW_DOMAIN = "logo-cap-test.com";

/** A one-pixel PNG that passes the type and size checks. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

/** The upstream, stubbed, and a count of how often it was actually asked. */
function stubUpstream(body: BodyInit) {
  const fetchStub = vi.fn(
    async () =>
      new Response(body, {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
  );
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

function cached(domain: string) {
  return db
    .select()
    .from(companyLogos)
    .where(eq(companyLogos.domain, domain));
}

beforeEach(async () => {
  await db.execute(sql`delete from company_logos where domain like 'stale-%'`);
  await db.execute(sql`delete from company_logos where domain = ${NEW_DOMAIN}`);
  await db.execute(
    sql`delete from company_logos where domain = 'endless-cap-test.com'`,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the logo cache", () => {
  it("evicts the oldest rows once it is full, keeping the newest", async () => {
    // 5,001 rows, oldest first, so the eviction order is unambiguous.
    await db.execute(sql`
      insert into company_logos (domain, status, fetched_at)
      select 'stale-' || g, 'none', now() - (g || ' minutes')::interval
      from generate_series(1, 5001) g
    `);

    const fetchStub = stubUpstream(PNG);
    const logo = await resolveCompanyLogo(NEW_DOMAIN, null, `https://${NEW_DOMAIN}`);
    expect(fetchStub).toHaveBeenCalled();
    expect(logo).not.toBeNull();

    // The new domain survived; the oldest rows are the ones that went.
    // `fetched_at` is `now() - g minutes`, so the highest g is the oldest and
    // the lowest is the most recent.
    expect(await cached(NEW_DOMAIN)).toHaveLength(1);
    expect(await cached("stale-5001")).toHaveLength(0);
    expect(await cached("stale-1")).toHaveLength(1);
  });

  it("stops reading an upstream body that will not end", async () => {
    // An endless body: without the byte cap this becomes `arrayBuffer()`
    // holding whatever the upstream sent, and the test hangs until the 5s
    // fetch deadline instead of returning in milliseconds.
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(8 * 1024));
      },
    });
    const fetchStub = stubUpstream(endless);

    const started = Date.now();
    const logo = await resolveCompanyLogo(
      "endless-cap-test.com",
      null,
      "https://endless-cap-test.com",
    );
    expect(fetchStub).toHaveBeenCalled();
    expect(logo).toBeNull();
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
