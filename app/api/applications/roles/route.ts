import { NextResponse } from "next/server";
import { listUsedRoles } from "@/lib/services/applications";
import { handleRouteError, requireSession } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

/** Role titles the user has used before, most recent first (autocomplete). */
export async function GET() {
  try {
    const userId = await requireSession();
    const roles = await listUsedRoles(userId);
    return NextResponse.json({ data: roles });
  } catch (err) {
    return handleRouteError(err);
  }
}
