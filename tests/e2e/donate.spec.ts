import { test, expect } from "@playwright/test";
import { createAppViaApi, registerUser, uniqueEmail } from "./helpers";

test("donate banner appears with an offer and 'Not now' hides it for a week", async ({
  page,
}) => {
  const email = uniqueEmail("donate");
  await registerUser(page, email);

  // No offers yet → no banner.
  await page.goto("/");
  await expect(page.getByText(/buy us a coffee/i)).toHaveCount(0);

  // Create an app and complete every milestone → offer.
  const id = await createAppViaApi(page, "Offer Co", "Engineer");
  const app = await (
    await page.request.get(`/api/applications/${id}`)
  ).json();
  for (const m of app.data.milestones) {
    const res = await page.request.patch(`/api/milestones/${m.id}`, {
      data: { status: "done" },
    });
    if (res.status() !== 200) throw new Error("milestone patch failed");
  }

  await page.reload();
  await expect(page.getByText(/buy us a coffee/i)).toBeVisible();

  // "Not now" hides it immediately…
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByText(/buy us a coffee/i)).toHaveCount(0);

  // …and it stays hidden after a reload (dismissed for a week).
  await page.reload();
  await expect(page.getByText(/buy us a coffee/i)).toHaveCount(0);

  // The user menu always has the donate item with a coffee icon.
  await page.getByRole("button", { name: "User menu" }).click();
  const donate = page.getByRole("menuitem", { name: "Donate" });
  await expect(donate).toBeVisible();
  await expect(donate.locator("svg.lucide-coffee")).toBeVisible();
});
