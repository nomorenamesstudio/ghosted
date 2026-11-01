import { NextResponse } from "next/server";
import { revokeAgentToken } from "@/lib/services/agent-tokens";
import {
  handleRouteError,
  jsonError,
  requireSessionForWrite,
} from "@/lib/utils/api";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Revoke: the row goes, so the next request that presents that secret is
 * refused. Nothing else changes — the agent keeps its own copy, it just stops
 * working.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const userId = await requireSessionForWrite("agent");
    if (!UUID_RE.test(id)) {
      return jsonError(404, "No such token", "NOT_FOUND");
    }
    const revoked = await revokeAgentToken(userId, id);
    if (!revoked) {
      return jsonError(404, "No such token", "NOT_FOUND");
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
