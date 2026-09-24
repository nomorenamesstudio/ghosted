import { expect, type Page } from "@playwright/test";
import postgres from "postgres";

const testDbUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://ghosted:ghosted@localhost:5432/ghosted_test";

/**
 * Mark a user's email as verified directly in the test database. E2E specs
 * that create many applications need this (unverified accounts are capped at
 * 3); the verification flow itself is covered by integration tests.
 */
export async function markUserVerified(email: string): Promise<void> {
  const sql = postgres(testDbUrl, { max: 1 });
  try {
    await sql`UPDATE users SET email_verified = true WHERE email = ${email}`;
  } finally {
    await sql.end();
  }
}

/**
 * The dashboard opens on the Kanban board now. Specs that assert list behaviour
 * (sections, infinite scroll over the sections) switch to List
 * first - the choice is remembered per browser, so once is enough.
 *
 * An account with no applications has no toolbar at all, so on a fresh account
 * there is no switch to click: seed the stored preference the Dashboard applies
 * on mount and reload instead. Same end state, and specs stay readable from the
 * empty account onwards.
 */
export async function useListView(page: Page): Promise<void> {
  const toggle = page
    .locator('[role="group"][aria-label="View"]')
    .getByRole("button", { name: "List" });

  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click();
  } else {
    await page.addInitScript(() => localStorage.setItem("ghosted-view", "list"));
    await page.reload();
  }

  await expect(page.getByTestId("application-sections")).toBeVisible();
}

/** Register a fresh user through the API (sets the session cookie). */
export async function registerUser(
  page: Page,
  email: string,
  password = "password123",
) {
  const res = await page.request.post("/api/auth/register", {
    data: { email, password, name: "E2E User" },
  });
  if (res.status() !== 201) {
    throw new Error(`register failed: ${res.status()} ${await res.text()}`);
  }
  return { email, password };
}

/** Register via the UI form (also used to test the register page itself). */
export async function registerViaUi(
  page: Page,
  email: string,
  password = "password123",
) {
  await page.goto("/register");
  await page.getByLabel("Name").fill("E2E User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
}

/** Log in through the login page UI. */
export async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Create an application through the API. */
export async function createAppViaApi(
  page: Page,
  company: string,
  role: string,
  /** Any other create fields — a long `url`, a contact, notes. */
  extra: Record<string, unknown> = {},
) {
  const res = await page.request.post("/api/applications", {
    data: { company, role, ...extra },
  });
  if (res.status() !== 201) {
    throw new Error(`create app failed: ${res.status()} ${await res.text()}`);
  }
  const json = (await res.json()) as { data: { id: string } };
  return json.data.id;
}

export const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.dev`;
