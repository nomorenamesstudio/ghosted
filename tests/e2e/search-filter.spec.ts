import { test, expect } from "@playwright/test";
import { createAppViaApi, registerUser, uniqueEmail } from "./helpers";

test("search and filter return expected results", async ({ page }) => {
  const email = uniqueEmail("search");
  await registerUser(page, email);
  await createAppViaApi(page, "Acme Corp", "Engineer");
  await createAppViaApi(page, "Globex", "Designer");

  await page.goto("/");
  const list = page.getByTestId("application-list");
  await expect(list.locator("li")).toHaveCount(2);

  // Search (case-insensitive partial match on company or role).
  await page.getByLabel("Search applications").fill("acme");
  await expect(list.locator("li")).toHaveCount(1);
  await expect(page.getByText("Acme Corp")).toBeVisible();
  await expect(page.getByText("Globex")).not.toBeVisible();

  // Clear search, filter by status → no matches.
  await page.getByLabel("Search applications").fill("");
  await expect(list.locator("li")).toHaveCount(2);
  await page.getByLabel("Filter by status").selectOption("offer");
  await expect(
    page.getByText("No applications match your filters."),
  ).toBeVisible();

  // Back to "applied" → both apps show again.
  await page.getByLabel("Filter by status").selectOption("applied");
  await expect(list.locator("li")).toHaveCount(2);
});
