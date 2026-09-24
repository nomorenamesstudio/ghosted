import { test, expect } from "@playwright/test";
import {
  createAppViaApi,
  registerUser,
  uniqueEmail,
  useListView,
} from "./helpers";

test("archived application moves to the closed Archived section in list view", async ({
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

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("Doomed Corp")).not.toBeVisible();

  // Nothing is active any more, so the list says exactly that...
  await expect(page.getByText("No active applications")).toBeVisible();

  // ...and keeps the archived section below it, closed: the application is
  // filed away, not gone, and it is not in the way until it is asked for.
  const archivedSection = page.getByTestId("section-archived");
  await expect(archivedSection).toBeVisible();
  const toggle = archivedSection.getByRole("button", { name: /Archived/i });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(archivedSection.getByText("Doomed Corp")).toHaveCount(0);

  const [emptyBox, archivedBox] = await Promise.all([
    page.getByText("No active applications").boundingBox(),
    archivedSection.boundingBox(),
  ]);
  expect(emptyBox!.y).toBeLessThan(archivedBox!.y);

  // Opening it shows what was archived.
  await toggle.click();
  await expect(archivedSection.getByText("Doomed Corp")).toBeVisible();
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
