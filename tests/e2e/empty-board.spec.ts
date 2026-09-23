import { test, expect, type Page } from "@playwright/test";
import { registerUser, uniqueEmail } from "./helpers";

/**
 * An account with nothing in it shows the empty state and *only* the empty
 * state: with no applications there is nothing to search, nothing to sort, no
 * second view to switch to, "Add application" is already the empty state's own
 * button, and the email-verification banner would only compete for the same
 * attention - a limit only starts to matter once there is something to add.
 *
 * Two things here are easy to get wrong and are the reason this spec exists.
 * Everything has to come back the moment the first application is added from
 * that empty state - it is gated on a live count, not on the server-rendered
 * one, which is a snapshot from page load. And a search that matches nothing
 * must never be mistaken for an empty account: hiding the controls there would
 * leave the user with no way to clear the filter.
 *
 * The hydration guard below earns its place the hard way: this gate makes the
 * dashboard's shape depend on client-side data, and a hydration mismatch shows
 * up only as a console error while every DOM assertion still passes. A real one
 * was reported in a browser and could not be reproduced here, so this is what
 * keeps it from being invisible next time.
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

async function expectNoToolbar(page: Page) {
  await expect(page.getByLabel("Search applications")).toHaveCount(0);
  await expect(page.getByLabel("Sort applications")).toHaveCount(0);
  await expect(page.locator('[role="group"][aria-label="View"]')).toHaveCount(0);
  await expect(page.getByTestId("add-application-fab")).toHaveCount(0);
}

test("empty account: empty state only, then everything returns with the first application", async ({
  page,
}) => {
  const hydrationErrors = watchForHydrationErrors(page);
  const email = uniqueEmail("empty-board");
  await registerUser(page, email);
  await page.goto("/app");

  // The empty state carries the only action on the screen.
  await expect(page.getByText("No applications yet")).toBeVisible();
  const cta = page.getByTestId("add-first-application");
  await expect(cta).toBeVisible();
  await expectNoToolbar(page);
  // Registered through the API, so this account is unverified: the banner has
  // to stay away until an application exists for its limit to apply to.
  await expect(page.getByLabel("Email verification notice")).toHaveCount(0);

  // Which is what actually gets used: no toolbar button to look for.
  await cta.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Company *").fill("Acme Corp");
  await dialog.getByLabel("Role *").fill("Engineer");
  await dialog.getByRole("button", { name: "Add application" }).click();

  await expect(page.getByText("Acme Corp")).toBeVisible();
  await expect(page.getByText("No applications yet")).toHaveCount(0);

  // The account is no longer empty, so the controls are back - in the header,
  // which is where a board puts them at this width - and so is the banner.
  await expect(
    page.getByTestId("header-slot").getByPlaceholder("Search company or role…"),
  ).toBeVisible();
  await expect(page.getByTestId("header-slot").getByLabel("Sort applications")).toBeVisible();
  await expect(page.getByTestId("header-slot").getByLabel("View")).toBeVisible();
  await expect(
    page.getByTestId("header-slot").getByTestId("add-application-fab"),
  ).toBeVisible();
  await expect(page.getByLabel("Email verification notice")).toBeVisible();

  expect(hydrationErrors, "hydration errors in the console").toEqual([]);
});

test("a search that matches nothing keeps its controls", async ({ page }) => {
  const hydrationErrors = watchForHydrationErrors(page);
  const email = uniqueEmail("empty-filter");
  await registerUser(page, email);
  await page.goto("/app");

  await page.getByTestId("add-first-application").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Company *").fill("Acme Corp");
  await dialog.getByLabel("Role *").fill("Engineer");
  await dialog.getByRole("button", { name: "Add application" }).click();
  await expect(page.getByText("Acme Corp")).toBeVisible();

  const search = page.getByLabel("Search applications");
  await search.fill("nothing matches this");

  // The "no matches" state is not the empty account state: the field the user
  // needs in order to undo it has to stay on screen.
  await expect(page.getByText("No applications match your filters.")).toBeVisible();
  await expect(search).toBeVisible();
  await expect(page.getByLabel("Sort applications")).toBeVisible();

  expect(hydrationErrors, "hydration errors in the console").toEqual([]);
});
