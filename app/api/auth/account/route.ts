import { NextResponse } from "next/server";
import { deleteAccount } from "@/lib/services/account";
import { readBooleanFlag } from "@/lib/config/flags";
import { handleRouteError, jsonError, requireSessionForWrite } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

/** GDPR erasure: permanently delete the account and all of its data. */
export async function DELETE() {
  try {
    const userId = await requireSessionForWrite("account");

    // A closed-registration instance has exactly one account, so deleting it
    // would leave nobody able to sign in — the instance would be bricked with no
    // way back short of editing the database. The settings page hides the
    // button; this is the guard that makes it true.
    // Read fresh rather than from the cached config: this is a guard, and a
    // stale "registration is open" is the direction that deletes somebody's
    // only account. The settings page only decides whether to *offer* the
    // button, so a cached answer there is harmless.
    //
    // One flag, not `readConfig()`: that validates the whole deployment,
    // including email, and a rotated Resend key should not turn a delete
    // attempt into a 500. An unreadable flag counts as closed — the safe
    // direction for a destructive endpoint.
    let registrationOpen = true;
    try {
      registrationOpen = readBooleanFlag(process.env, "ALLOW_REGISTRATION", true);
    } catch {
      registrationOpen = false;
    }
    if (!registrationOpen) {
      return jsonError(
        403,
        "This instance has a single account — deleting it would lock everyone out. Export your data instead.",
        "ACCOUNT_DELETION_DISABLED",
      );
    }

    await deleteAccount(userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
