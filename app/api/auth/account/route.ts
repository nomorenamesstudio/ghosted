import { NextResponse } from "next/server";
import { deleteAccount } from "@/lib/services/account";
import { handleRouteError, requireSession } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

/** GDPR erasure: permanently delete the account and all of its data. */
export async function DELETE() {
  try {
    const userId = await requireSession();
    await deleteAccount(userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
