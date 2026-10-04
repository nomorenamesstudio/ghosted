import { test, expect } from "@playwright/test";
import { loginViaUi, registerUser, registerViaUi, uniqueEmail } from "./helpers";

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

/**
 * The flow the owner asked for: the landing stays reachable for someone who is
 * already signed in — a marketing page you can only see while logged out is a
 * page you cannot link to anyone — and "Sign in" is what takes them into the
 * app. Before this, `/` bounced them straight to `/app`.
 */
test("a signed-in visitor can read the landing, and Sign in takes them in", async ({
  page,
}) => {
  const email = uniqueEmail("landing");
  await registerUser(page, email);

  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.getByRole("link", { name: "Sign in" }).click();
  // /login answers "you are already signed in" by going to the app.
  await expect(page).toHaveURL(/\/app$/);
});
