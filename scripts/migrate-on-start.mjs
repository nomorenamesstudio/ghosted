/**
 * Apply pending Drizzle migrations, then exit.
 * Used as the container start command (see railway.json) so a fresh
 * production database is migrated automatically on every deploy.
 * Runs with plain Node — no CLI tooling needed at runtime.
 *
 * Multi-replica safety: takes a Postgres advisory lock so that when several
 * containers start simultaneously (rolling deploy), only one runs the
 * migrations; the others block until it finishes, then exit.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Prefer the unpooled URL when present (PgBouncer): migrations need a
// direct server connection, not a pooled one.
const url = process.env.DATABASE_UNPOOLED_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set — cannot run migrations.");
  process.exit(1);
}

const client = postgres(url, { max: 1, prepare: false });
const MIGRATION_LOCK_KEY = 727_001_337; // arbitrary app-specific key

try {
  // pg_advisory_lock blocks until the lock is held; the lock is released
  // automatically when this session closes (even on crash), so a failed
  // replica can never leave migrations permanently locked.
  await client`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
  console.log("Acquired migration lock; applying pending migrations…");

  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  console.log("Database migrations applied.");

  await client`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
} finally {
  await client.end();
}
