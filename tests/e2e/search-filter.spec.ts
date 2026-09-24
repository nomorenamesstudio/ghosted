import { test, expect } from "@playwright/test";
import {
  createAppViaApi,
  registerUser,
  uniqueEmail,
  useListView,
} from "./helpers";

test("search and filter return expected results", async ({ page }) => {
  const email = uniqueEmail("search");
  await registerUser(page, email);
  await createAppViaApi(page, "Acme Corp", "Engineer");
  await createAppViaApi(page, "Globex", "Designer");

  await page.goto("/app");
  await useListView(page);

  // Both apps live in the "Applied" section; empty sections are hidden.
  const appliedSection = page.getByTestId("section-applied");
  await expect(appliedSection).toBeVisible();
  await expect(appliedSection.locator("li")).toHaveCount(2);
  await expect(page.getByTestId("section-offer")).toHaveCount(0);

  // Search (case-insensitive partial match on company or role).
  await page.getByLabel("Search applications").fill("acme");
  await expect(appliedSection.locator("li")).toHaveCount(1);
  await expect(page.getByText("Acme Corp")).toBeVisible();
  await expect(page.getByText("Globex")).not.toBeVisible();

  // Clear search; filter by status → no matching sections.
  await page.getByLabel("Search applications").fill("");
  await expect(appliedSection.locator("li")).toHaveCount(2);
  await page.getByLabel("Filter by status").click();
  await page.getByRole("option", { name: "Offers" }).click();
  await expect(
    page.getByText("No applications match your filters."),
  ).toBeVisible();

  // Back to "Applied" → both apps show again.
  await page.getByLabel("Filter by status").click();
  await page.getByRole("option", { name: "Applied" }).click();
  await expect(appliedSection.locator("li")).toHaveCount(2);

  // Clearing the filter restores every section. The stat cards used to be the
  // other way back to this state; the dropdown is the only one now.
  await page.getByLabel("Filter by status").click();
  await page.getByRole("option", { name: "All statuses" }).click();
  await expect(appliedSection.locator("li")).toHaveCount(2);
  await expect(page.getByTestId("section-offer")).toHaveCount(0);
});
