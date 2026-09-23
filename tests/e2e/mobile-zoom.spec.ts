import { test, expect, devices, type Page } from "@playwright/test";
import { createAppViaApi, registerUser, uniqueEmail } from "./helpers";

/**
 * iOS Safari zooms the whole page when a focused text control's font size is
 * under 16px. The fix is a CSS rule scoped to touch pointers (app/globals.css),
 * which is invisible to every other kind of test — and trivially defeated by
 * accident, because Tailwind's utilities are unlayered: adding `text-sm` to a
 * new control silently drops it back under the threshold. An unclassed
 * `textarea`/`select` loses to `.text-sm` for the same reason, which is exactly
 * how the first version of the fix left the milestone dialog zooming while the
 * inputs next to it were fine.
 *
 * So this asserts the invariant itself, in a real browser at a phone viewport,
 * on the surfaces that collect input.
 *
 * The device is applied field by field rather than with `...devices["iPhone
 * 12"]`: that descriptor carries `defaultBrowserType: "webkit"`, and spreading
 * it into `test.use` makes Playwright launch WebKit, which this repo does not
 * install — it runs every spec in Chromium. What matters here is the emulated
 * touch pointer, and Chromium reports that faithfully.
 */
const iPhone = devices["iPhone 12"];
test.use({
  viewport: iPhone.viewport,
  userAgent: iPhone.userAgent,
  deviceScaleFactor: iPhone.deviceScaleFactor,
  isMobile: iPhone.isMobile,
  hasTouch: iPhone.hasTouch,
});

async function expectControlsAreZoomSafe(page: Page, where: string) {
  const undersized = await page.evaluate(() =>
    Array.from(document.querySelectorAll("input, textarea, select"))
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => {
        const type = el.getAttribute("type") ?? "-";
        return `${el.tagName.toLowerCase()}[${type}]=${getComputedStyle(el).fontSize}`;
      }),
  );
  expect(undersized, `${where}: iOS would zoom on focus`).toEqual([]);
}

test("form controls stay at 16px or more on a touch viewport", async ({ page }) => {
  await page.goto("/login");

  // If the emulation ever stops reporting a touch pointer, the rule under test
  // would not apply and this file would pass for the wrong reason.
  expect(
    await page.evaluate(() =>
      matchMedia("(hover: none) and (pointer: coarse)").matches,
    ),
    "this spec must emulate a coarse pointer",
  ).toBe(true);

  await expectControlsAreZoomSafe(page, "/login");

  await page.goto("/register");
  await expectControlsAreZoomSafe(page, "/register");

  // Signed in: the dashboard search field.
  await registerUser(page, uniqueEmail("zoom"));
  await page.goto("/app");
  await expectControlsAreZoomSafe(page, "/app");

  // The add-milestone dialog is the case that nearly shipped broken: a plain
  // <select> and the Textarea component, neither of which carry the attribute
  // filters that accidentally lifted the `input` rule above `.text-sm`.
  const appId = await createAppViaApi(page, "Zoom Co", "Designer");
  await page.goto(`/applications/${appId}`);
  await page.getByRole("button", { name: "Add milestone" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expectControlsAreZoomSafe(page, "add-milestone dialog");
  await expect(dialog.locator("textarea, select").first()).toBeVisible();
});
