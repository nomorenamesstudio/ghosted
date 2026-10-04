import { NextResponse } from "next/server";
import { toggleFavorite } from "@/lib/services/applications";
import { handleRouteError, jsonError, requireSessionForWrite } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Toggle the favorite flag (favorites are pinned to the top of lists). */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const userId = await requireSessionForWrite("applications");
    if (!UUID_RE.test(id)) {
      return jsonError(404, "Application not found", "NOT_FOUND");
    }
    const application = await toggleFavorite(userId, id);
    if (!application) {
      return jsonError(404, "Application not found", "NOT_FOUND");
    }
    return NextResponse.json({ data: application });
  } catch (err) {
    return handleRouteError(err);
  }
}
