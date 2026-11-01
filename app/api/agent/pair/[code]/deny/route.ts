import { NextResponse } from "next/server";
import { denyPairing } from "@/lib/services/agent-pairings";
import {
  handleRouteError,
  jsonError,
  requireSessionForWrite,
} from "@/lib/utils/api";

export const dynamic = "force-dynamic";

/** Deny: the code is dropped, so any claim in flight can never collect. */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const userId = await requireSessionForWrite("agent");
    const denied = await denyPairing(userId, code);
    if (!denied) {
      return jsonError(404, "No such pairing", "NOT_FOUND");
    }
    return NextResponse.json({ data: { code, state: "denied" } });
  } catch (err) {
    return handleRouteError(err);
  }
}
