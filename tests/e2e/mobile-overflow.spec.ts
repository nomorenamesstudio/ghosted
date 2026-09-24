import { test, expect, type Page } from "@playwright/test";
import { createAppViaApi, registerUser, uniqueEmail } from "./helpers";

/**
 * Phone widths, where a single unbreakable string can push a whole page sideways.
 *
 * The device profile is spelled out rather than spread from `devices["iPhone 12"]`,
 * which carries `defaultBrowserType: "webkit"` and would silently swap the engine.
 */
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});

const LONG_URL =
  "https://boards.greenhouse.io/embed/job_app?for=acme&token=8473921&gh_src=averylongquerystringthatshouldnotfit&utm_campaign=spring";

/** Nothing may stick out past the viewport: that is the whole class of bug. */
const overflows = (page: Page) =>
  page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

async function detailPageWithLongUrl(page: Page) {
  const email = uniqueEmail("mobile-detail");
  await registerUser(page, email);
  const id = await createAppViaApi(page, "Acme Corp", "Engineer", {
    url: LONG_URL,
    // Same class of bug in a different field: a long unbroken string in notes.
    notes: "Referral from averylongname@acme-corporation-international.example\nPortfolio: https://www.example.com/portfolio/2026/09/a-really-long-path-segment",
  });
  await page.goto(`/applications/${id}`);
  await page.getByTestId("status-badge").waitFor();
  return id;
}

test("a long job-posting URL is truncated, not laid over the card", async ({
  page,
}) => {
  await detailPageWithLongUrl(page);

  const link = page.getByRole("link", { name: /boards\.greenhouse\.io/ });
  const card = page.locator("main").first();
  const linkBox = (await link.boundingBox())!;
  const cardBox = (await card.boundingBox())!;

  // Truncated to the column it sits in, rather than painting outside it.
  expect(linkBox.x + linkBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
  // And the page itself does not scroll sideways.
  const { scrollWidth, clientWidth } = await overflows(page);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});

test("the detail page stays inside the viewport with the milestone editor open", async ({
  page,
}) => {
  await detailPageWithLongUrl(page);

  // The editor holds the date field, which is the other thing that overflows at
  // phone width on iOS.
  await page.getByTestId("milestone-timeline").getByRole("button").first().click();
  const panel = page.locator('[id^="milestone-panel-"]').first();
  await expect(panel).toBeVisible();

  const date = panel.locator('input[type="date"]');
  await expect(date).toBeVisible();
  const dateBox = (await date.boundingBox())!;
  const panelBox = (await panel.boundingBox())!;
  expect(dateBox.x + dateBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);

  const { scrollWidth, clientWidth } = await overflows(page);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
