import { expect, test } from "@playwright/test";
import { createAppViaApi, registerUser, uniqueEmail } from "./helpers";

/**
 * The board an agent is writing to.
 *
 * This is the contract the feature exists for: a tab that has been open the whole
 * time shows a row an outside writer filed — no reload, no navigation, no click.
 * The poll runs every 15s, so the assertion waits a little longer than that; the
 * point is that it happens *by itself*.
 */
test("the open board picks up a write it did not make", async ({ page }) => {
  await registerUser(page, uniqueEmail("live"));

  // One application so the board has something on it before we watch it.
  await createAppViaApi(page, "Existing Co", "Designer");
  await page.goto("/app");
  await expect(page.getByText("Existing Co")).toBeVisible();

  // What an agent through MCP does: a write this tab never heard about.
  await createAppViaApi(page, "Filed By The Agent", "Design Engineer");

  await expect(page.getByText("Filed By The Agent")).toBeVisible({
    timeout: 25_000,
  });
  // And nothing was reloaded under the user: the URL is still where it was.
  expect(new URL(page.url()).pathname).toBe("/app");
});
