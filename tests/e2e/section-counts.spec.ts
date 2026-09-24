import { test, expect } from "@playwright/test";
import {
  createAppViaApi,
  registerUser,
  uniqueEmail,
  useListView,
} from "./helpers";

/**
 * The section headers carry the counts (the stat-card row they used to duplicate
 * is gone), so they are what has to keep up with a status change.
 */
test("section counts follow a milestone-driven status change", async ({
  page,
}) => {
  const email = uniqueEmail("section-counts");
  await registerUser(page, email);
  await page.goto("/app");
  await useListView(page);
  // Nothing yet: empty sections render nothing at all, so no counts on screen.
  await expect(page.getByTestId("section-count-applied")).toHaveCount(0);

  const id = await createAppViaApi(page, "Globex", "Engineer");
  // API-created data isn't in the SPA cache yet — reload to refetch.
  await page.reload();
  await expect(page.getByTestId("section-count-applied")).toHaveText("1");

  // Complete the "Technical Interview" milestone (3rd of the 5 defaults) by
  // opening its timeline row and saving: a pending step saves as done.
  await page.goto(`/applications/${id}`);
  const timeline = page.getByTestId("milestone-timeline");
  await timeline
    .getByRole("button", { name: /Technical Interview/ })
    .click();
  await page.getByRole("button", { name: /Save & mark done/ }).click();
  await expect(page.getByTestId("status-badge")).toHaveText("interviewing");

  // Back on the dashboard the card has left "Applied" for "Interviewing".
  await page.getByRole("link", { name: /Back to dashboard/ }).click();
  await expect(page.getByTestId("section-count-interviewing")).toHaveText("1");
  await expect(page.getByTestId("section-count-applied")).toHaveCount(0);
});

test("the dashboard carries no stat-card row in either view", async ({
  page,
}) => {
  const email = uniqueEmail("no-stat-cards");
  await registerUser(page, email);
  await createAppViaApi(page, "Acme Corp", "Engineer");

  await page.goto("/app");
  await useListView(page);
  await expect(page.getByTestId("section-count-applied")).toHaveText("1");
  await expect(page.getByTestId("stat-total")).toHaveCount(0);

  // The board never had them, and still does not.
  await page
    .locator('[role="group"][aria-label="View"]')
    .getByRole("button", { name: "Board" })
    .click();
  await expect(page.getByTestId("kanban-board")).toBeVisible();
  await expect(page.getByTestId("stat-total")).toHaveCount(0);
});
