import { test, expect } from "@playwright/test";
import { createAppViaApi, registerUser, uniqueEmail } from "./helpers";

/** Columns in the order the stages actually happen. */
const COLUMN_ORDER = [
  "applied",
  "interviewing",
  "offer",
  "ghosted",
  "rejected",
  "archived",
];

test("the board is the default view, in pipeline order", async ({ page }) => {
  const email = uniqueEmail("board");
  await registerUser(page, email);
  await createAppViaApi(page, "Acme Corp", "Engineer");

  await page.goto("/app");

  await expect(page.getByTestId("kanban-board")).toBeVisible();
  await expect(page.getByTestId("application-sections")).toHaveCount(0);

  // Stat cards and the status filter belong to the list; on the board the
  // columns are the statuses.
  await expect(page.getByTestId("stat-total")).toHaveCount(0);
  await expect(page.getByLabel("Filter by status")).toHaveCount(0);

  const columns = await page
    .locator('[data-testid^="kanban-column-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
  expect(columns).toEqual(COLUMN_ORDER.map((c) => `kanban-column-${c}`));

  // Empty columns are still rendered, so there is always a drop target.
  await expect(page.getByTestId("kanban-column-offer")).toBeVisible();
  await expect(page.getByTestId("kanban-column-applied")).toContainText(
    "Acme Corp",
  );
});

test("a card changes column from its move menu", async ({ page }) => {
  const email = uniqueEmail("board-move");
  await registerUser(page, email);
  await createAppViaApi(page, "Acme Corp", "Engineer");

  await page.goto("/app");
  const applied = page.getByTestId("kanban-column-applied");
  await expect(applied.getByText("Acme Corp")).toBeVisible();

  // The menu is the touch/keyboard route; forwarding (Applied → Offers) needs
  // no confirmation, unlike a backwards move.
  await page
    .getByRole("button", { name: "Move Acme Corp to another status" })
    .click();
  await page.getByRole("menuitem", { name: "Offers" }).click();

  await expect(page.getByTestId("kanban-column-offer")).toContainText(
    "Acme Corp",
  );
  await expect(applied.getByText("Acme Corp")).toHaveCount(0);
});

test("the controls sit in the header on a wide screen, not in a row", async ({
  page,
}) => {
  const email = uniqueEmail("board-header");
  await registerUser(page, email);
  await createAppViaApi(page, "Acme Corp", "Engineer");

  // Playwright's default viewport is 1280px, which is exactly the xl
  // breakpoint the header placement starts at.
  await page.goto("/app");
  const header = page.getByTestId("header-slot");
  await expect(header.getByPlaceholder("Search company or role…")).toBeVisible();
  await expect(header.getByLabel("Sort applications")).toBeVisible();
  await expect(header.getByLabel("View")).toBeVisible();
  await expect(header.getByTestId("add-application-fab")).toBeVisible();

  // List view keeps them in their own row, at any width.
  await page
    .locator('[role="group"][aria-label="View"]')
    .getByRole("button", { name: "List" })
    .click();
  await expect(page.getByTestId("application-sections")).toBeVisible();
  await expect(
    page.getByTestId("header-slot").getByPlaceholder("Search company or role…"),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder("Search company or role…")).toBeVisible();
});

test("the list view is still reachable and remembered", async ({ page }) => {
  const email = uniqueEmail("board-toggle");
  await registerUser(page, email);
  await createAppViaApi(page, "Acme Corp", "Engineer");

  await page.goto("/app");
  await page
    .locator('[role="group"][aria-label="View"]')
    .getByRole("button", { name: "List" })
    .click();
  await expect(page.getByTestId("application-sections")).toBeVisible();

  // The choice survives a reload.
  await page.reload();
  await expect(page.getByTestId("application-sections")).toBeVisible();
  await expect(page.getByTestId("kanban-board")).toHaveCount(0);
});
