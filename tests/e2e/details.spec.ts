import { test, expect } from "@playwright/test";
import { createAppViaApi, registerUser, uniqueEmail } from "./helpers";

/**
 * The details card is read-only; editing happens in a modal. The old inline
 * form made the page a settings screen and hid the values behind inputs, and
 * the progress bar was removed because the timeline already says where the
 * application stands.
 */
test("details are read-only until edited in the modal", async ({ page }) => {
  const email = uniqueEmail("details");
  await registerUser(page, email);
  const id = await createAppViaApi(page, "Acme Corp", "Frontend Engineer");

  await page.goto(`/applications/${id}`);
  await page.getByRole("heading", { level: 1 }).waitFor();

  // No progress bar, and no form fields on the page.
  await expect(page.getByLabel("Application progress")).toHaveCount(0);
  // The card holds no fields. (The timeline does: its open accordion panel is a
  // form in its own right.)
  const card = page
    .locator("div.rounded-xl")
    .filter({ has: page.getByRole("heading", { name: "Details" }) });
  await expect(card.locator("input, textarea")).toHaveCount(0);
  // Unset values read as "not set" rather than as empty fields.
  await expect(page.getByLabel("Not set").first()).toBeVisible();

  // The form lives behind the card's kebab now (no Edit button on the card).
  await page.getByRole("button", { name: "Application actions" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  // exact: "Company" is a substring of "Company website".
  await expect(dialog.getByLabel("Company", { exact: true })).toHaveValue(
    "Acme Corp",
  );
  await expect(dialog.getByLabel("Role")).toHaveValue("Frontend Engineer");

  await dialog.getByLabel("Company website").fill("acme.com");
  await dialog.getByLabel("Role").fill("Staff Engineer");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  // The card reflects the saved values, and the header the new role.
  await expect(page.getByRole("link", { name: /acme\.com/ })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Staff Engineer")).toBeVisible();
});

test("the role field autocompletes from roles already used", async ({ page }) => {
  const email = uniqueEmail("details-roles");
  await registerUser(page, email);
  const id = await createAppViaApi(page, "Acme Corp", "Frontend Engineer");

  await page.goto(`/applications/${id}`);
  await page.getByRole("heading", { level: 1 }).waitFor();

  await page.getByRole("button", { name: "Application actions" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  const role = dialog.getByLabel("Role", { exact: true });

  // Typing offers the titles this user has used before, and the list is the
  // app's own popover surface rather than browser-drawn chrome.
  await role.fill("Front");
  const listbox = dialog.getByRole("listbox");
  await expect(listbox).toBeVisible();
  await expect(dialog.getByRole("option")).toContainText(["Frontend Engineer"]);

  // Keyboard: the first match is active, Enter commits it.
  await role.press("ArrowDown");
  await role.press("Enter");
  await expect(role).toHaveValue("Frontend Engineer");
  await expect(listbox).toBeHidden();
});
