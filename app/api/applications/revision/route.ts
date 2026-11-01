import { NextResponse } from "next/server";
import { applicationRevision } from "@/lib/services/applications";
import { handleRouteError, requireSession } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

/**
 * How the open board notices a change it did not make.
 *
 * Cheap on purpose: the client polls this every few seconds and only refetches the
 * board when the value moves, so a quiet tab costs one tiny query and a tab an
 * agent is writing to updates within seconds. `no-store` comes from middleware.
 */
export async function GET() {
  try {
    const userId = await requireSession();
    return NextResponse.json({ data: { revision: await applicationRevision(userId) } });
  } catch (err) {
    return handleRouteError(err);
  }
}
