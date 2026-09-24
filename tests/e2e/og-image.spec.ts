import { test, expect } from "@playwright/test";

/**
 * The social card. Two things break it silently: crawlers cache it by URL (so a
 * replaced file keeps serving the old card unless the URL changes), and a card
 * that isn't close to 1.91:1 gets cropped or letterboxed in the preview — which
 * is why the declared dimensions are checked against the bytes rather than
 * trusted.
 */
const CARD_RATIO = 1200 / 630;

test("the og image is absolute, declared honestly and actually served", async ({
  page,
}) => {
  await page.goto("/");

  const url = await page
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  expect(url, "og:image is set").toBeTruthy();
  // Crawlers fetch it without a page context, so a relative URL is a broken card.
  expect(url!.startsWith("http"), `og:image is absolute (${url})`).toBe(true);
  expect(url).toContain("/ghost-og.png");
  expect(url, "versioned for crawler caches").toContain("?v=");

  const declared = {
    width: Number(
      await page.locator('meta[property="og:image:width"]').getAttribute("content"),
    ),
    height: Number(
      await page.locator('meta[property="og:image:height"]').getAttribute("content"),
    ),
  };
  expect(declared.width).toBeGreaterThan(0);
  expect(declared.height).toBeGreaterThan(0);
  await expect(page.locator('meta[property="og:image:alt"]')).not.toHaveAttribute(
    "content",
    /^$/,
  );

  const res = await page.request.get(url!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");

  // The bytes have to match what the tags promise.
  const png = Buffer.from(await res.body());
  expect(png.readUInt32BE(16), "declared width matches the file").toBe(declared.width);
  expect(png.readUInt32BE(20), "declared height matches the file").toBe(declared.height);
  expect(declared.width / declared.height).toBeCloseTo(CARD_RATIO, 2);
});

test("the twitter card uses the same image", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
  const twitterImage = await page
    .locator('meta[name="twitter:image"]')
    .getAttribute("content");
  const ogImage = await page
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  expect(twitterImage).toBe(ogImage);
});
