import { test, expect } from "@playwright/test";
import { registerUser, uniqueEmail } from "./helpers";

test("create an application and add a milestone", async ({ page }) => {
  const email = uniqueEmail("create");
  await registerUser(page, email);
  await page.goto("/app");
  await expect(page.getByText("No applications yet")).toBeVisible();

  // Open the add-application modal. This account is empty, so the toolbar is
  // hidden and the empty state's own button is the way in.
  await page.getByTestId("add-first-application").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Company *").fill("Acme Corp");
  await dialog.getByLabel("Role *").fill("Frontend Engineer");
  await dialog.getByLabel("Job posting URL").fill("https://acme.example/jobs/1");
  await dialog.getByRole("button", { name: "Add application" }).click();

  // The card appears on the dashboard.
  const card = page.getByText("Acme Corp");
  await expect(card).toBeVisible();

  // Open the detail view: default 5-step timeline is present.
  await card.click();
  await expect(page).toHaveURL(/\/applications\//);
  const timeline = page.getByTestId("milestone-timeline");
  // The timeline ends with the "Add milestone" row, which is not a step.
  const steps = timeline.locator('li:not([data-testid="timeline-add"])');
  await expect(timeline.getByText("Application")).toBeVisible();
  await expect(timeline.getByText("Offer/Decision")).toBeVisible();
  await expect(steps).toHaveCount(5);
  await expect(page.getByTestId("timeline-add")).toBeVisible();

  // Add a custom milestone at the end, from the timeline itself.
  await page.getByRole("button", { name: "Add milestone" }).click();
  const milestoneDialog = page.getByRole("dialog");
  await milestoneDialog.getByLabel("Title *").fill("On-site Interview");
  await milestoneDialog.getByRole("button", { name: "Add milestone" }).click();
  await expect(timeline.getByText("On-site Interview")).toBeVisible();
  await expect(steps).toHaveCount(6);
});
