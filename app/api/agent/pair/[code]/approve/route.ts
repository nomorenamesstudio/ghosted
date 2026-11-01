import { NextResponse } from "next/server";
import { approvePairing } from "@/lib/services/agent-pairings";
import {
  handleRouteError,
  jsonError,
  requireSessionForWrite,
} from "@/lib/utils/api";

export const dynamic = "force-dynamic";

/**
 * Approve. Nothing is minted yet: the token appears when the agent collects it,
 * so an approval nobody comes back for leaves no credential behind.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const userId = await requireSessionForWrite("agent");
    const approved = await approvePairing(userId, code);
    if (!approved) {
      return jsonError(
        404,
        "That code is unknown, expired or already approved",
        "NOT_FOUND",
      );
    }
    return NextResponse.json({ data: { code, state: "approved" } });
  } catch (err) {
    return handleRouteError(err);
  }
}
