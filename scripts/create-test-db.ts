/**
 * Creates the test database referenced by TEST_DATABASE_URL if it does not
 * already exist (idempotent). Used by `pnpm db:create-test` locally and in CI.
 */
import postgres from "postgres";

async function main() {
  const url =
    process.env.TEST_DATABASE_URL ??
    "postgres://ghosted:ghosted@localhost:5432/ghosted_test";
  const dbName = new URL(url).pathname.slice(1) || "ghosted_test";
  const adminUrl = url.replace(/\/[^/?]+(\?.*)?$/, "/postgres$1");

  const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(`CREATE DATABASE "${dbName}"`);
    console.log(`created database "${dbName}"`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("already exists")) {
      console.log(`database "${dbName}" already exists`);
    } else {
      throw err;
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
