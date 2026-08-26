import { test, expect } from "@playwright/test";
import { createAppViaApi, registerUser, uniqueEmail } from "./helpers";

test("dashboard stats update after a milestone-driven status change", async ({
  page,
}) => {
  const email = uniqueEmail("stats");
  await registerUser(page, email);
  await page.goto("/app");
  await expect(page.getByTestId("stat-total")).toHaveText("0");

  const id = await createAppViaApi(page, "Globex", "Engineer");
  // API-created data isn't in the SPA cache yet — reload to refetch stats.
  await page.reload();
  await expect(page.getByTestId("stat-total")).toHaveText("1");
  await expect(page.getByTestId("stat-active")).toHaveText("1");
  await expect(page.getByTestId("stat-interviewing")).toHaveText("0");

  // Complete the "Technical Interview" milestone (3rd of the 5 defaults)
  // via its "…" menu.
  await page.goto(`/applications/${id}`);
  const timeline = page.getByTestId("milestone-timeline");
  await timeline
    .locator("li")
    .nth(2)
    .getByRole("button", { name: "Actions for Technical Interview" })
    .click();
  await page.getByRole("menuitem", { name: "Mark done" }).click();

  // Auto-advance: status becomes interviewing.
  await expect(page.getByTestId("status-badge")).toHaveText("interviewing");

  // Back on the dashboard the interviewing stat reflects the change.
  await page.getByRole("link", { name: /Back to dashboard/ }).click();
  await expect(page.getByTestId("stat-interviewing")).toHaveText("1");
  await expect(page.getByTestId("stat-active")).toHaveText("1");
});
