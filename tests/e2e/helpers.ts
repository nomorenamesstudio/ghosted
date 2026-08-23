import type { Page } from "@playwright/test";

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
) {
  const res = await page.request.post("/api/applications", {
    data: { company, role },
  });
  if (res.status() !== 201) {
    throw new Error(`create app failed: ${res.status()} ${await res.text()}`);
  }
  const json = (await res.json()) as { data: { id: string } };
  return json.data.id;
}

export const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.dev`;
