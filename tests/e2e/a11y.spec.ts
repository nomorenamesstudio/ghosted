import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createAppViaApi, registerUser, uniqueEmail } from "./helpers";

/**
 * Accessibility audit with axe on the key routes. Runs in CI with the rest
 * of the e2e suite, so regressions fail the build.
 */
async function audit(page: import("@playwright/test").Page, name: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const violations = results.violations;
  expect(
    violations,
    `${name}: ${violations
      .map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}`)
      .join(", ")}`,
  ).toEqual([]);
}

test("a11y: public pages", async ({ page }) => {
  for (const path of [
    "/login",
    "/register",
    "/forgot-password",
    "/privacy",
    "/terms",
    "/imprint",
  ]) {
    await page.goto(path);
    await audit(page, path);
  }
});

test("a11y: authenticated pages", async ({ page }) => {
  const email = uniqueEmail("a11y");
  await registerUser(page, email);
  const id = await createAppViaApi(page, "Acme Corp", "Engineer");

  await page.goto("/");
  await audit(page, "/");

  await page.goto(`/applications/${id}`);
  // Wait for the detail view to render (the loading skeleton has no h1).
  await page.getByRole("heading", { level: 1 }).waitFor();
  await audit(page, "/applications/[id]");

  await page.goto("/settings");
  await audit(page, "/settings");
});
