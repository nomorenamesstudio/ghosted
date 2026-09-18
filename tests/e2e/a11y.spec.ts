import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createAppViaApi, registerUser, uniqueEmail } from "./helpers";

/**
 * Accessibility audit with axe on the key routes, in **both themes**: the light
 * palette is the one people squint at (pale tints, grey-on-grey surfaces), so
 * auditing only the default theme would miss it. Runs in CI with the rest of
 * the e2e suite, so regressions fail the build.
 */
async function audit(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const violations = results.violations;
  expect(
    violations,
    `${name}: ${violations
      .map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}`)
      .join(", ")}`,
  ).toEqual([]);
}

/** Seed localStorage before the app boots (theme and view live there). */
async function setPrefs(page: Page, prefs: Record<string, string>) {
  await page.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) {
      window.localStorage.setItem(key, value);
    }
  }, prefs);
}

const THEMES = ["light", "dark"] as const;

test("a11y: public pages", async ({ page }) => {
  await setPrefs(page, { "ghosted-theme": "light" });
  for (const path of [
    "/",
    "/login",
    "/register",
    "/forgot-password",
    "/verify-email",
    "/privacy",
    "/terms",
    "/imprint",
  ]) {
    await page.goto(path);
    await audit(page, `${path} (light)`);
  }
});

test("a11y: authenticated pages, both themes", async ({ page }) => {
  const email = uniqueEmail("a11y");
  await registerUser(page, email);
  const id = await createAppViaApi(page, "Acme Corp", "Engineer");

  for (const theme of THEMES) {
    // Kanban board — the dashboard's default view.
    await setPrefs(page, { "ghosted-theme": theme, "ghosted-view": "board" });
    await page.goto("/app");
    await expect(page.getByTestId("kanban-board")).toBeVisible();
    await audit(page, `/app board (${theme})`);

    // List view, whose sections and stat cards the board replaces.
    await setPrefs(page, { "ghosted-theme": theme, "ghosted-view": "list" });
    await page.goto("/app");
    await expect(page.getByTestId("application-sections")).toBeVisible();
    await audit(page, `/app list (${theme})`);

    await page.goto(`/applications/${id}`);
    // Wait for the detail view to render (the loading skeleton has no h1).
    await page.getByRole("heading", { level: 1 }).waitFor();
    await audit(page, `/applications/[id] (${theme})`);

    // The details form lives in a modal now, so audit it open.
    await page.getByRole("button", { name: "Application actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await audit(page, `/applications/[id] edit modal (${theme})`);
    await page.keyboard.press("Escape");

    await page.goto("/settings");
    await audit(page, `/settings (${theme})`);
  }
});
