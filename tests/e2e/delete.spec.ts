import { test, expect } from "@playwright/test";
import {
  createAppViaApi,
  registerUser,
  uniqueEmail,
  useListView,
} from "./helpers";

test("archived application disappears from the list view", async ({
  page,
}) => {
  const email = uniqueEmail("delete");
  await registerUser(page, email);
  const id = await createAppViaApi(page, "Doomed Corp", "Engineer");

  await page.goto("/app");
  await useListView(page);
  await expect(page.getByText("Doomed Corp")).toBeVisible();

  // Open the detail view and archive it (soft delete) via the "…" menu.
  await page.goto(`/applications/${id}`);
  await page.getByRole("button", { name: "Application actions" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();

  // Confirm via the proper modal (no browser popup).
  const confirmDialog = page.getByRole("dialog");
  await confirmDialog.getByRole("button", { name: "Archive" }).click();

  // Back on the dashboard the app is no longer visible: the list hides the
  // archived section unless the status filter asks for it.
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("Doomed Corp")).not.toBeVisible();
  await expect(page.getByText("No applications yet")).toBeVisible();
});

test("archived application stays in the Archived column on the board", async ({
  page,
}) => {
  // Deliberate difference between the two views: the board renders every
  // column, so a filed-away application stays in sight (and can be dragged
  // back out) instead of vanishing until it is filtered for.
  const email = uniqueEmail("delete-board");
  await registerUser(page, email);
  const id = await createAppViaApi(page, "Filed Corp", "Engineer");

  const res = await page.request.delete(`/api/applications/${id}`);
  expect(res.ok()).toBe(true);

  await page.goto("/app");
  const archived = page.getByTestId("kanban-column-archived");
  await expect(archived).toBeVisible();
  await expect(archived.getByText("Filed Corp")).toBeVisible();
});
