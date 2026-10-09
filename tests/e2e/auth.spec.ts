import { test, expect } from "@playwright/test";
import {
  loginViaUi,
  markMustChangePassword,
  registerUser,
  registerViaUi,
  uniqueEmail,
} from "./helpers";

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
 * The one-line legal notice under the auth box, with both documents reachable
 * from it. It is what points at the terms where an account is created — a footer
 * link alone does not incorporate them (OLG Frankfurt, 6 U 121/21) — and the
 * OAuth buttons create accounts from this same screen.
 */
test("the auth pages say what signing up agrees to", async ({ page }) => {
  for (const path of ["/login", "/register"]) {
    await page.goto(path);
    // Scoped to `main`: the footer carries its own links to the same documents,
    // and the notice is the one under the form.
    const main = page.getByRole("main");
    await expect(
      main.getByText("By creating an account or signing in you agree to the"),
    ).toBeVisible();
    await expect(
      main.getByRole("link", { name: "Terms of Service" }),
    ).toHaveAttribute("href", "/terms");
    await expect(
      main.getByRole("link", { name: "Privacy Policy" }),
    ).toHaveAttribute("href", "/privacy");
  }
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

/**
 * The forced password change, in a browser, because the mocked-session tests
 * cannot reach the part that actually carries the flag: the JWT. This test was
 * written after a container run showed the flow was broken while every unit test
 * passed — the token never received the claim at sign-in.
 */
test("a generated password must be replaced before the app opens", async ({ page }) => {
  const email = uniqueEmail("seeded");
  await registerUser(page, email);
  await markMustChangePassword(email);

  // Sign out, then in again with the credential the instance generated.
  await page.goto("/app");
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);

  await loginViaUi(page, email, "password123");

  // Not the dashboard: the only page this account can reach is the one that
  // replaces the password.
  await expect(page).toHaveURL(/\/change-password$/);
  await expect(page.getByText("Choose your own password")).toBeVisible();

  await page.getByLabel("Current password").fill("password123");
  await page.getByLabel("New password", { exact: true }).fill("my-own-password1");
  await page.getByLabel("Confirm new password").fill("my-own-password1");
  await page.getByRole("button", { name: /Save password/ }).click();

  // Signed out, told why, and the new password works.
  await expect(page).toHaveURL(/\/login\?passwordChanged=1/);
  await expect(page.getByText("Password saved")).toBeVisible();
  await loginViaUi(page, email, "my-own-password1");
  await expect(page).toHaveURL(/\/app$/);
});
