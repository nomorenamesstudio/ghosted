import { test, expect } from "@playwright/test";
import { registerUser, uniqueEmail, markUserVerified } from "./helpers";

/**
 * Stress test: hundreds of applications must lazy-load via the infinite
 * scroll sentinel, with sticky section headers, and without page errors.
 */
test("stress: hundreds of applications load via infinite scroll", async ({
  page,
}) => {
  test.setTimeout(240_000);

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const email = uniqueEmail("stress");
  await registerUser(page, email);
  // 220 applications exceed the unverified-account cap (3), so verify first.
  await markUserVerified(email);

  const TOTAL = 220;
  for (let i = 0; i < TOTAL; i++) {
    const res = await page.request.post("/api/applications", {
      data: {
        company: `Stress Co ${String(i).padStart(3, "0")}`,
        role: "Engineer",
      },
    });
    if (res.status() !== 201) {
      throw new Error(`create failed at ${i}: ${res.status()}`);
    }
  }

  await page.goto("/app");
  const cards = page.locator("[data-testid^=section-] li");

  // First page only (PAGE_SIZE = 50).
  await expect(cards).toHaveCount(50, { timeout: 20_000 });

  // Section headers are sticky (stay visible while scrolling).
  await expect(
    page.locator("[data-testid^=section-] button").first(),
  ).toHaveCSS("position", "sticky");

  // Scroll until the sentinel has loaded everything.
  for (let i = 0; i < 80; i++) {
    if ((await cards.count()) >= TOTAL) break;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
  }
  await expect(cards).toHaveCount(TOTAL, { timeout: 30_000 });

  // The sentinel is gone once everything is loaded.
  await expect(
    page.getByRole("button", { name: /Load more|Loading/ }),
  ).toHaveCount(0);

  // The scroll-to-top button appeared after scrolling down…
  const scrollTop = page.getByRole("button", { name: "Scroll to top" });
  await expect(scrollTop).toBeVisible();

  // …clicking it returns to the top and it disappears again.
  await scrollTop.click();
  await page.waitForFunction(() => window.scrollY < 100);
  await expect(scrollTop).toHaveCount(0);

  // No client errors during the whole stress session.
  expect(errors).toEqual([]);
});
