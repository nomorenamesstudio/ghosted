import { NextResponse } from "next/server";
import { acknowledgePasswordDrop } from "@/lib/services/account";
import { handleRouteError, requireSession } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

/**
 * The user has read the notice that a provider sign-in cleared their password,
 * so it stops showing on the dashboard. Session-authenticated, and it only ever
 * clears a marker on the caller's own row.
 */
export async function POST() {
  try {
    const userId = await requireSession();
    await acknowledgePasswordDrop(userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
