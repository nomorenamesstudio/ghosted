// Render the banner composition at both canvas sizes from the file:// HTML.
// Renders docs/assets/banner/banner.html to the two README images.
//   PLAYWRIGHT_BROWSERS_PATH=./.browsers node scripts/render-readme-banner.mjs
// The two card crops in that folder come from a live capture of the demo
// account, so re-run the capture before regenerating if the UI changed.
import { chromium } from "@playwright/test";

const OUT = new URL("../docs/assets/banner/", import.meta.url).pathname;

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const [size, width, height] of [["header", 1600, 640], ["social", 1200, 630]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(`file://${OUT}banner.html?size=${size}`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    await page.locator("#canvas").screenshot({ path: `${OUT}rendered-${size}.png` });
    console.log(`   rendered rendered-${size}.png`);
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
