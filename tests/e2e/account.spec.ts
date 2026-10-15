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

  // Poll the session itself rather than waiting a fixed 500 ms and hoping: the
  // contract is that the new name reaches the session, and an arbitrary delay
  // turns a cold dev server (first compile) into a flaky suite.
  await expect
    .poll(
      async () => {
        const res = await page.request.get("/api/auth/session");
        return (await res.json())?.user?.name;
      },
      { timeout: 10_000 },
    )
    .toBe("New Name");

  // The user menu reflects it.
  await page.getByRole("button", { name: "User menu" }).click();
  await expect(page.getByText("New Name")).toBeVisible();
});

test("settings: changing the email asks for the password", async ({ page }) => {
  const email = uniqueEmail("mailmove");
  await registerUser(page, email);
  await page.goto("/settings");

  // The field appears only once the address differs from the saved one — no
  // password prompt for the people who never touch it.
  await expect(page.getByLabel("Current password")).toBeHidden();
  await page.getByLabel("Email").fill(`moved-${email}`);
  await expect(page.getByLabel("Current password")).toBeVisible();

  // A session without the password cannot move the address.
  await page.getByLabel("Current password").fill("not-the-password");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Current password is incorrect")).toBeVisible();

  // With it, the address moves and the card says what happens next.
  await page.getByLabel("Current password").fill("password123");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Not verified yet")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(`moved-${email}`);
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
