import { test, expect, type Page } from "@playwright/test";
import { createAppViaApi, registerUser, uniqueEmail } from "./helpers";

/**
 * The dashboard must hydrate cleanly for a user who has dismissed the email
 * verification banner.
 *
 * `useVerification` used to read the dismissal straight out of localStorage in
 * the `useState` initialiser, so the client's first render hid the banner that
 * the server had already rendered (the server has no localStorage). Every
 * sibling after it then shifted, and React reported the desync at whichever
 * element it tried to claim next — in practice the search icon inside
 * `ApplicationList`, as "Expected server HTML to contain a matching <svg> in
 * <div>". That error only appears in a profile that has dismissed the banner,
 * survives a hard reload, and is invisible to a fresh browser profile, which is
 * why it took a real browser to catch.
 *
 * The account is left unverified and given one application on purpose: an
 * unverified account is the only one the banner renders for, and an account
 * with an application keeps the toolbar (and therefore its icons) on screen, so
 * the shifted node is still there to be mismatched.
 */

/** Console/page errors that mean React re-rendered from scratch. */
function watchForHydrationErrors(page: Page): string[] {
  const errors: string[] = [];
  const take = (text: string) => {
    if (/hydrat|server HTML|did not match/i.test(text)) errors.push(text.slice(0, 600));
  };
  page.on("console", (m) => m.type() === "error" && take(m.text()));
  page.on("pageerror", (e) => take(e.message));
  return errors;
}

test("a dismissed verification banner must not break hydration", async ({
  page,
  context,
}) => {
  const hydrationErrors = watchForHydrationErrors(page);
  const email = uniqueEmail("hydrate-banner");
  await registerUser(page, email);
  await createAppViaApi(page, "Acme Corp", "Engineer");

  // Dismiss the banner the way the UI does, but *before* the next render: this
  // is the state a returning user is in, and the state the server cannot know.
  await context.addInitScript(() => {
    localStorage.setItem(
      "ghosted-verify-banner",
      String(Date.now() + 24 * 60 * 60 * 1000),
    );
  });
  await page.goto("/app");
  await page.waitForTimeout(1500);

  // The banner really is being hidden by the stored dismissal, not by anything
  // else (an empty account would hide it too, hence the application above).
  await expect(page.getByLabel("Email verification notice")).toHaveCount(0);
  await expect(page.getByText("Acme Corp")).toBeVisible();

  expect(hydrationErrors, "hydration errors in the console").toEqual([]);
});
