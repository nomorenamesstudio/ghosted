import { NextResponse } from "next/server";
import { getStats } from "@/lib/services/applications";
import { handleRouteError, requireSession } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireSession();
    const stats = await getStats(userId);
    return NextResponse.json({ data: stats });
  } catch (err) {
    return handleRouteError(err);
  }
}
