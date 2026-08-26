import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Singleton DB client for the Next.js app.
 * Uses `DATABASE_URL` in the app and `TEST_DATABASE_URL` under Vitest.
 */
const globalForDb = globalThis as unknown as {
  __ghostedDb?: PostgresJsDatabase<typeof schema>;
};

function getConnectionString(): string {
  if (process.env.NODE_ENV === "test") {
    const testUrl = process.env.TEST_DATABASE_URL;
    if (!testUrl) {
      throw new Error("TEST_DATABASE_URL is required in test environment");
    }
    return testUrl;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

export function createDb(
  connectionString = getConnectionString(),
): PostgresJsDatabase<typeof schema> {
  const client = postgres(connectionString, {
    max: Number(process.env.DB_POOL_MAX ?? 10),
    prepare: true,
    onnotice: () => {},
  });
  return drizzle(client, { schema });
}

function getInstance(): PostgresJsDatabase<typeof schema> {
  if (globalForDb.__ghostedDb) return globalForDb.__ghostedDb;
  const instance = createDb();
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__ghostedDb = instance;
  }
  return instance;
}

/**
 * Lazy singleton: the connection is only created on first use. This keeps
 * `next build` from crashing while collecting page data (it imports route
 * modules without a DATABASE_URL set) and avoids opening a connection at
 * import time.
 */
export const db: PostgresJsDatabase<typeof schema> = new Proxy(
  {} as PostgresJsDatabase<typeof schema>,
  {
    get: (_target, prop) => Reflect.get(getInstance(), prop),
  },
);

/** Raw postgres connection for schema setup in tests/scripts. */
export function createRawClient(connectionString = getConnectionString()) {
  return postgres(connectionString, { max: 1, prepare: false });
}
