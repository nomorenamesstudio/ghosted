import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  createAppViaApi,
  loginViaUi,
  registerUser,
  uniqueEmail,
} from "./helpers";

test("settings: update profile name", async ({ page }) => {
  const email = uniqueEmail("profile");
  await registerUser(page, email);

  await page.goto("/settings");
  await page.getByLabel("Name").fill("New Name");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile updated.")).toBeVisible();

  // The user menu reflects the new name after the server session refresh.
  await page.getByRole("button", { name: "User menu" }).click();
  await expect(page.getByText("New Name")).toBeVisible();
});

test("settings: change password and sign in with it", async ({ page }) => {
  const email = uniqueEmail("pw");
  await registerUser(page, email);

  await page.goto("/settings");
  await page.getByLabel("Current password").fill("password123");
  await page.getByLabel("New password").fill("newpassword456");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("Password updated.")).toBeVisible();

  // Sign out and sign back in with the new password.
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);

  await loginViaUi(page, email, "newpassword456");
  await expect(page).toHaveURL(/\/$/);
});

test("settings: export downloads all data", async ({ page }) => {
  const email = uniqueEmail("export");
  await registerUser(page, email);
  await createAppViaApi(page, "Acme Corp", "Engineer");

  await page.goto("/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export my data" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^ghosted-export-.*\.json$/);

  const path = await download.path();
  const data = JSON.parse(readFileSync(path!, "utf8")) as {
    user: { email: string };
    applications: Array<{ company: string; milestones: unknown[] }>;
  };
  expect(data.user.email).toBe(email);
  expect(data.applications).toHaveLength(1);
  expect(data.applications[0].company).toBe("Acme Corp");
  expect(data.applications[0].milestones).toHaveLength(5);
});

test("settings: delete account erases everything", async ({ page }) => {
  const email = uniqueEmail("delacc");
  await registerUser(page, email);
  await createAppViaApi(page, "Doomed", "Engineer");

  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Delete account" }).click();

  // Redirected to the login page…
  await expect(page).toHaveURL(/\/login/);

  // …and the account is gone.
  await loginViaUi(page, email, "password123");
  await expect(page.getByText("Invalid email or password")).toBeVisible();
});
