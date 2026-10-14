import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deploymentProblems } from "@/lib/config/flags";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * Liveness and readiness for whatever runs this container.
 *
 * Two things make it worth having: a compose/k8s probe needs an endpoint that
 * answers without a session, and the most common self-hosting failure is the
 * app being up while the database is not — which a plain "is the process
 * listening" check cannot see. So this touches the database.
 *
 * It deliberately answers with state, not with identity: the release version
 * used to be in this response, and it is unauthenticated and public, so it
 * told anyone who asked exactly which build to look up advisories for. An
 * operator has better sources for "what am I running?" — the image tag, the
 * release notes, `package.json` in the checkout — and none of them are on the
 * open internet.
 */
export async function GET() {
  // Configuration is part of readiness: a process with a broken deployment would
  // otherwise answer "healthy" while the parts that need mail fail. The problem
  // *list* goes to the log; the response says only that something is wrong,
  // because a probe is not a place to publish configuration details.
  const problems = deploymentProblems();
  const configOk = problems.length === 0;
  if (!configOk) {
    logger.error(
      { problems },
      "health check: the deployment configuration is not coherent",
    );
  }

  try {
    await db.execute(sql`select 1`);
    const ok = configOk;
    return NextResponse.json(
      {
        ok,
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
        database: "down",
        config: configOk ? "ok" : "invalid",
        uptimeSeconds: Math.round(process.uptime()),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
