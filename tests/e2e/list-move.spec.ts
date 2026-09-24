import { test, expect } from "@playwright/test";
import {
  createAppViaApi,
  registerUser,
  uniqueEmail,
  useListView,
} from "./helpers";

/**
 * The list view's cards carry the same "Move to" menu the board's do. The board
 * has drag and drop as well; here the menu is the only way to change status
 * without opening the application.
 */
test("a list card changes section from its move menu", async ({ page }) => {
  const email = uniqueEmail("list-move");
  await registerUser(page, email);
  await createAppViaApi(page, "Acme Corp", "Engineer");

  await page.goto("/app");
  await useListView(page);

  const applied = page.getByTestId("section-applied");
  await expect(applied.getByText("Acme Corp")).toBeVisible();

  // Opening the menu must not follow the card's link to the detail page.
  await page
    .getByRole("button", { name: "Move Acme Corp to another status" })
    .click();
  await expect(page).toHaveURL(/\/app$/);

  await page.getByRole("menuitem", { name: "Rejected" }).click();

  // Out of the source section, into the destination — the move invalidates
  // exactly those two, so this is also the check that neither is stale.
  await expect(page.getByTestId("section-rejected")).toContainText("Acme Corp");
  await expect(applied.getByText("Acme Corp")).toHaveCount(0);

  // And back, from that card's own menu.
  await page
    .getByRole("button", { name: "Move Acme Corp to another status" })
    .click();
  await page.getByRole("menuitem", { name: "Applied" }).click();
  await expect(applied.getByText("Acme Corp")).toBeVisible();
  await expect(page.getByTestId("section-rejected")).toHaveCount(0);
});

test("the menu offers every status except the one the card is in", async ({
  page,
}) => {
  const email = uniqueEmail("list-move-targets");
  await registerUser(page, email);
  await createAppViaApi(page, "Acme Corp", "Engineer");

  await page.goto("/app");
  await useListView(page);
  await expect(page.getByTestId("section-applied")).toContainText("Acme Corp");

  await page
    .getByRole("button", { name: "Move Acme Corp to another status" })
    .click();
  const items = await page
    .getByRole("menuitem")
    .evaluateAll((els) => els.map((e) => e.textContent?.trim()));
  // "Ghosted" is absent on purpose: it is derived from inactivity, not set.
  expect(items).toEqual(["Interviewing", "Offers", "Rejected", "Archived"]);
});
