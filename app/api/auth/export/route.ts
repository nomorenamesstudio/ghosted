import { NextResponse } from "next/server";
import { exportUserData } from "@/lib/services/account";
import { handleRouteError, jsonError, requireSessionForWrite } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

/** GDPR portability (Art. 20): download all account data as JSON. */
export async function GET() {
  try {
    const userId = await requireSessionForWrite("export");
    const data = await exportUserData(userId);
    if (!data) {
      return jsonError(404, "User not found", "NOT_FOUND");
    }
    const date = new Date().toISOString().slice(0, 10);
    return NextResponse.json(data, {
      headers: {
        "Content-Disposition": `attachment; filename="ghosted-export-${date}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
