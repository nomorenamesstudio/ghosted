import { NextResponse } from "next/server";
import { version as packageVersion } from "@/package.json";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * Liveness and readiness for whatever runs this container.
 *
 * Two things make it worth having: a compose/k8s probe needs an endpoint that
 * answers without a session, and the most common self-hosting failure is the
 * app being up while the database is not — which a plain "is the process
 * listening" check cannot see. So this touches the database, and reports the
 * version, which is also how an operator answers "what am I actually running?".
 */
export async function GET() {
  // From package.json rather than `npm_package_version`: the latter is only set
  // when the process was started through a package script, so a container run
  // any other way would answer "unknown" to the one question this field exists
  // for.
  const version = packageVersion;
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json(
      {
        ok: true,
        version,
        database: "up",
        uptimeSeconds: Math.round(process.uptime()),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error({ err: error }, "health check: database unreachable");
    return NextResponse.json(
      {
        ok: false,
        version,
        database: "down",
        uptimeSeconds: Math.round(process.uptime()),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
