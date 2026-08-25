import dotenv from "dotenv";
import postgres from "postgres";

/**
 * Wipes the e2e database before the run starts.
 * Runs in a Node context (not a test), so dotenv is loaded manually.
 */
export default async function globalSetup() {
  dotenv.config({ path: ".env" });
  const url =
    process.env.TEST_DATABASE_URL ??
    "postgres://ghosted:ghosted@localhost:5432/ghosted_test";
  const sql = postgres(url, { max: 1 });
  try {
    await sql`TRUNCATE TABLE users CASCADE`;
  } finally {
    await sql.end();
  }
}
