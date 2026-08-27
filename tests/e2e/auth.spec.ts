import { test, expect } from "@playwright/test";
import { loginViaUi, registerViaUi, uniqueEmail } from "./helpers";

test("register, sign out, and log back in", async ({ page }) => {
  const email = uniqueEmail("auth");

  // Register via the UI → auto-login lands on the dashboard.
  await registerViaUi(page, email);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("No applications yet")).toBeVisible();

  // Sign out via the user menu → back to the landing page.
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);

  // Log back in with the same credentials.
  await loginViaUi(page, email, "password123");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("No applications yet")).toBeVisible();
});

test("unauthenticated users are redirected to login", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);
});
