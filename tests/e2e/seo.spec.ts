import { test, expect } from "@playwright/test";

/**
 * The landing's search surface: what a crawler reads without running the app.
 *
 * These are the parts of SEO that break silently — a title that says nothing, a
 * canonical that is relative, structured data that is invalid JSON in the page,
 * a sitemap a private instance should not be serving — plus the one performance
 * contract that is worth a browser: the page must not download the captures it
 * is not showing. Every variant is in the DOM (one per theme, one per device),
 * so dropping `loading="lazy"` puts ~900 KB back without changing a pixel.
 */

test("the title carries the search term, and the canonical is absolute", async ({
  page,
}) => {
  await page.goto("/");

  const title = await page.title();
  expect(title, `title is not the bare brand (${title})`).not.toBe("Ghosted");
  expect(title).toContain("Ghosted");
  expect(title).toContain("job application");
  // Long titles are truncated in results, which loses the tail — usually the
  // part that distinguishes this from every other tracker.
  expect(title.length, `title is ${title.length} characters`).toBeLessThanOrEqual(60);

  const [canonical, ogUrl] = await Promise.all([
    page.locator('link[rel="canonical"]').getAttribute("href"),
    page.locator('meta[property="og:url"]').getAttribute("content"),
  ]);
  expect(canonical, "canonical is set").toBeTruthy();
  expect(ogUrl, "og:url is set").toBeTruthy();
  // A crawler with only the HTML cannot resolve a relative canonical against
  // anything, and the app answers on several hostnames.
  expect(canonical!.startsWith("http"), `canonical is absolute (${canonical})`).toBe(
    true,
  );
  expect(ogUrl!.startsWith("http"), `og:url is absolute (${ogUrl})`).toBe(true);
  expect(new URL(canonical!).origin).toBe(new URL(ogUrl!).origin);
});

test("the structured data parses inside the page and names the app", async ({
  page,
}) => {
  await page.goto("/");

  const raw = await page
    .locator('script[type="application/ld+json"]')
    .first()
    .textContent();
  expect(raw, "a JSON-LD block is rendered").toBeTruthy();

  // Parsed from the served page, not from the builder: the failure this guards
  // is a block that is invalid JSON once Next has escaped and inlined it.
  const data = JSON.parse(raw!);
  expect(data["@context"]).toBe("https://schema.org");
  expect(data["@type"]).toBe("SoftwareApplication");
  expect(data.name).toBe("Ghosted");
  expect(data.url.startsWith("http")).toBe(true);
  expect(data.applicationCategory).toBe("BusinessApplication");

  // Claims nobody has made on the owner's behalf. Structured data that
  // overstates is a penalty risk, so their absence is the contract.
  for (const invented of ["aggregateRating", "review", "offers", "price"]) {
    expect(data, `no ${invented} claim`).not.toHaveProperty(invented);
  }
});

test("the sitemap lists this instance's absolute URLs", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);

  const xml = await res.text();
  expect(xml).toContain("<urlset");
  const locations = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (m) => m[1]);
  expect(locations.length).toBeGreaterThan(0);
  for (const loc of locations) {
    expect(loc.startsWith("http"), `absolute location (${loc})`).toBe(true);
  }
  expect(locations.some((loc) => loc.endsWith("/"))).toBe(true);

  // robots.txt must point at it, or the sitemap is discoverable only by luck.
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Sitemap:");
});

test("the landing does not download the captures it is not showing", async ({
  page,
}) => {
  const captures: { name: string; bytes: number }[] = [];
  page.on("response", async (res) => {
    const name = res.url().split("/").pop() ?? "";
    if (!res.url().includes("/landing-views/")) return;
    let bytes = 0;
    try {
      bytes = (await res.body()).length;
    } catch {
      // A body that is already gone still counts as a request.
    }
    captures.push({ name, bytes });
  });

  await page.goto("/");
  await page.waitForLoadState("load");
  await page.mouse.wheel(0, 4000);
  await page.waitForTimeout(1500);

  expect(captures.length, "at least the visible capture loads").toBeGreaterThan(0);

  // Playwright's default colour scheme is light, so every dark variant is
  // display:none — and a hidden, lazy image is never fetched. Before this was
  // pinned, the same page fetched all eight files (903 KB).
  const unexpected = captures.filter((c) => !c.name.endsWith("-light.webp"));
  expect(
    unexpected.map((c) => c.name),
    "only the visible light captures, in WebP",
  ).toEqual([]);

  const total = captures.reduce((sum, c) => sum + c.bytes, 0);
  expect(total, `capture payload is ${Math.round(total / 1024)} KB`).toBeLessThan(
    250 * 1024,
  );
});
