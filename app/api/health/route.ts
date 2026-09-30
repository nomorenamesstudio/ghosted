import { NextResponse } from "next/server";
import { version as packageVersion } from "@/package.json";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { readConfig } from "@/lib/config/flags";
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

  // Configuration is part of readiness now that it is validated at request time
  // rather than at build: a process with a broken deployment config would
  // otherwise answer "healthy" while every page fails. The problem *list* goes
  // to the log; the response says only that something is wrong, because a probe
  // is not a place to publish configuration details.
  let configOk = true;
  try {
    readConfig();
  } catch (error) {
    configOk = false;
    logger.error({ err: error }, "health check: invalid deployment configuration");
  }

  try {
    await db.execute(sql`select 1`);
    const ok = configOk;
    return NextResponse.json(
      {
        ok,
        version,
        database: "up",
        config: configOk ? "ok" : "invalid",
        uptimeSeconds: Math.round(process.uptime()),
      },
      { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error({ err: error }, "health check: database unreachable");
    return NextResponse.json(
      {
        ok: false,
        version,
        database: "down",
        config: configOk ? "ok" : "invalid",
        uptimeSeconds: Math.round(process.uptime()),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
