import { test, expect } from "@playwright/test";

/**
 * The home-screen icon set, and the tags that make a saved web app use it.
 *
 * iOS takes `<link rel="apple-touch-icon">` and ignores the manifest's icons;
 * Android takes the manifest's. iOS also paints transparency as black, so the
 * apple icon has to be flat — which is why this checks the PNG colour type rather
 * than just its dimensions, the one mistake that looks fine everywhere else.
 */
/** Every file that has to be served and correctly shaped. */
const ICONS = [
  { src: "/apple-touch-icon.png", size: 180 },
  { src: "/icon-192.png", size: 192 },
  { src: "/icon-512.png", size: 512 },
];

/** The subset the manifest lists — iOS ignores those and takes the link tag. */
const MANIFEST_ICONS = ["/icon-192.png", "/icon-512.png"];

/** The previous set, kept in the repo so the icon can be reverted. */
const ARCHIVE = [
  "/icons-v1/apple-touch-icon.png",
  "/icons-v1/icon-192.png",
  "/icons-v1/icon-512.png",
  "/icons-v1/icon-maskable-512.png",
];

const pngHeader = (body: Buffer) => ({
  width: body.readUInt32BE(16),
  height: body.readUInt32BE(20),
  // IHDR: 8-bit depth, then colour type — 2 is truecolour, 6 is truecolour+alpha.
  bitDepth: body[24],
  colourType: body[25],
});

test("the manifest describes an installable app with the icon set", async ({
  page,
}) => {
  const res = await page.request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const manifest = await res.json();

  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/app");
  expect(manifest.name).toBeTruthy();
  expect(manifest.short_name).toBeTruthy();
  // Android's splash and status bar, matching the icon's own background.
  expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  expect(manifest.background_color).toBe(manifest.theme_color);

  const sources = manifest.icons.map((i: { src: string }) => i.src);
  for (const src of MANIFEST_ICONS) expect(sources).toContain(src);
  // Android crops to its own shape, so a maskable variant has to be declared.
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
});

test("every icon is served, at the size it claims, flat for iOS", async ({
  page,
}) => {
  for (const { src, size } of ICONS) {
    const res = await page.request.get(src);
    expect(res.status(), `${src} status`).toBe(200);
    expect(res.headers()["content-type"], `${src} type`).toContain("image/png");

    const header = pngHeader(Buffer.from(await res.body()));
    expect(header.width, `${src} width`).toBe(size);
    expect(header.height, `${src} height`).toBe(size);
    // Truecolour without an alpha channel: iOS composites transparency onto
    // black, so a transparent icon arrives as a black square.
    expect(header.colourType, `${src} colour type`).toBe(2);
  }
});

test("the previous icon set is still there to revert to", async ({ page }) => {
  for (const src of ARCHIVE) {
    const res = await page.request.get(src);
    expect(res.status(), `${src} status`).toBe(200);
  }
});

test("the pages link the icons and the standalone meta tags", async ({ page }) => {
  await page.goto("/login");

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/apple-touch-icon.png",
  );
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
    "content",
    "yes",
  );
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
    "content",
    "Ghosted",
  );

  const hrefs = await page
    .locator('link[rel="icon"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
  expect(hrefs).toEqual(expect.arrayContaining(["/icon-192.png", "/icon-512.png"]));
});
