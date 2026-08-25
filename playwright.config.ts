import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

// E2E runs against the dedicated test database so it never touches dev data.
const testDbUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://ghosted:ghosted@localhost:5432/ghosted_test";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // Port 3000 is taken by the environment's nginx — use 3100.
    command: "pnpm dev --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: testDbUrl,
      TEST_DATABASE_URL: testDbUrl,
      NEXT_PUBLIC_APP_URL: "http://localhost:3100",
      // E2E must never send real emails — force the dev-log fallback.
      RESEND_API_KEY: "",
      // E2E registers many users per run; rate limiting is covered by unit
      // tests, so keep it out of the way here.
      RATE_LIMIT_MAX: "100000",
      PLAYWRIGHT_BROWSERS_PATH: path.resolve(__dirname, ".browsers"),
    },
  },
});
