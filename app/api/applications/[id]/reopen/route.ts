import { NextResponse } from "next/server";
import { reopenApplication } from "@/lib/services/applications";
import { handleRouteError, jsonError, requireSession } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Restore an archived application to its pre-archive status. */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const userId = await requireSession();
    if (!UUID_RE.test(params.id)) {
      return jsonError(404, "Application not found", "NOT_FOUND");
    }
    const application = await reopenApplication(userId, params.id);
    if (!application) {
      return jsonError(404, "Application not found", "NOT_FOUND");
    }
    return NextResponse.json({ data: application });
  } catch (err) {
    return handleRouteError(err);
  }
}
