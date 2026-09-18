import { test, expect } from "@playwright/test";
import {
  createAppViaApi,
  registerUser,
  uniqueEmail,
  useListView,
} from "./helpers";

test("dashboard stats update after a milestone-driven status change", async ({
  page,
}) => {
  const email = uniqueEmail("stats");
  await registerUser(page, email);
  await page.goto("/app");
  await useListView(page);
  await expect(page.getByTestId("stat-total")).toHaveText("0");

  const id = await createAppViaApi(page, "Globex", "Engineer");
  // API-created data isn't in the SPA cache yet — reload to refetch stats.
  await page.reload();
  await expect(page.getByTestId("stat-total")).toHaveText("1");
  await expect(page.getByTestId("stat-applied")).toHaveText("1");
  await expect(page.getByTestId("stat-interviewing")).toHaveText("0");

  // Complete the "Technical Interview" milestone (3rd of the 5 defaults) by
  // opening its timeline row and saving: a pending step saves as done.
  await page.goto(`/applications/${id}`);
  const timeline = page.getByTestId("milestone-timeline");
  await timeline
    .getByRole("button", { name: /Technical Interview/ })
    .click();
  await page.getByRole("button", { name: /Save & mark done/ }).click();

  // Auto-advance: status becomes interviewing.
  await expect(page.getByTestId("status-badge")).toHaveText("interviewing");

  // Back on the dashboard the interviewing stat reflects the change.
  await page.getByRole("link", { name: /Back to dashboard/ }).click();
  await expect(page.getByTestId("stat-interviewing")).toHaveText("1");
  await expect(page.getByTestId("stat-applied")).toHaveText("1");
});
