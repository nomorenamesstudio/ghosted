import { NextResponse } from "next/server";
import { resetTimeline } from "@/lib/services/applications";
import { handleRouteError, jsonError, requireSessionForWrite } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Put every step on an application's timeline back to `pending` and clear its
 * date. Used when an application goes all the way back to `applied`: the
 * process starts over, but the step titles are kept.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const userId = await requireSessionForWrite("applications");
    if (!UUID_RE.test(params.id)) {
      return jsonError(404, "Application not found", "NOT_FOUND");
    }
    const result = await resetTimeline(userId, params.id);
    if (!result) {
      return jsonError(404, "Application not found", "NOT_FOUND");
    }
    return NextResponse.json({ data: result.application, milestones: result.milestones });
  } catch (err) {
    return handleRouteError(err);
  }
}
