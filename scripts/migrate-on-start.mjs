/**
 * Apply pending Drizzle migrations, then exit.
 * Used as the container start command (see railway.json) so a fresh
 * production database is migrated automatically on every deploy.
 * Runs with plain Node — no CLI tooling needed at runtime.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set — cannot run migrations.");
  process.exit(1);
}

const client = postgres(url, { max: 1, prepare: false });
try {
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  console.log("Database migrations applied.");
} finally {
  await client.end();
}
