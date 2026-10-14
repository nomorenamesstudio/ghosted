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
  // Save only appears after a change (details-page pattern).
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Profile updated.")).toBeVisible();
  // Let the server layout re-render with the updated session JWT.
  await page.waitForTimeout(500);

  // The user menu reflects the new name.
  await page.getByRole("button", { name: "User menu" }).click();
  await expect(page.getByText("New Name")).toBeVisible();
});

test("settings: change password and sign in with it", async ({ page }) => {
  const email = uniqueEmail("pw");
  await registerUser(page, email);

  await page.goto("/settings");
  await page.getByRole("button", { name: "Change password" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Current password").fill("password123");
  await dialog.getByLabel("New password", { exact: true }).fill("newpassword456");
  await dialog
    .getByLabel("Confirm new password", { exact: true })
    .fill("newpassword456");
  await dialog.getByRole("button", { name: "Update password" }).click();

  // Changing the password revokes every session, including this one, so the card
  // ends by signing out and handing over to the login screen — which is the
  // sign-out this spec used to do by hand through the user menu.
  await expect(page).toHaveURL(/\/login\?passwordChanged=1/);
  await expect(
    page.getByText("Password saved — sign in with your new one."),
  ).toBeVisible();

  await loginViaUi(page, email, "newpassword456");
  await expect(page).toHaveURL(/\/app$/);
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
  // The session cookie alone is not proof the account holder asked for this:
  // the dialog now takes the password, and the request carries the CSRF token
  // the page fetched.
  await dialog.getByLabel("Your password").fill("password123");
  await dialog.getByRole("button", { name: "Delete account" }).click();

  // …and landed on the farewell page rather than the login screen: deleting an
  // account on purpose should not read like the deletion failed.
  await expect(page).toHaveURL(/\/account-deleted/);
  await expect(page.getByText("It’s gone.")).toBeVisible();

  // …and the account is gone.
  await loginViaUi(page, email, "password123");
  await expect(page.getByText("Invalid email or password")).toBeVisible();
});
