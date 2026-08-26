import { test, expect } from "@playwright/test";
import { createAppViaApi, registerUser, uniqueEmail } from "./helpers";

test("archived application disappears from the dashboard", async ({
  page,
}) => {
  const email = uniqueEmail("delete");
  await registerUser(page, email);
  const id = await createAppViaApi(page, "Doomed Corp", "Engineer");

  await page.goto("/app");
  await expect(page.getByText("Doomed Corp")).toBeVisible();

  // Open the detail view and archive it (soft delete) via the "…" menu.
  await page.goto(`/applications/${id}`);
  await page.getByRole("button", { name: "Application actions" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();

  // Confirm via the proper modal (no browser popup).
  const confirmDialog = page.getByRole("dialog");
  await confirmDialog.getByRole("button", { name: "Archive" }).click();

  // Back on the dashboard the app is no longer visible.
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("Doomed Corp")).not.toBeVisible();
  await expect(page.getByText("No applications yet")).toBeVisible();
});
