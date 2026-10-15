import { NextResponse } from "next/server";
import {
  deleteAccount,
  hasPassword,
  verifyPassword,
} from "@/lib/services/account";
import { registrationOpen } from "@/lib/config/flags";
import { handleRouteError, jsonError, requireSessionForWrite } from "@/lib/utils/api";
import { verifyCsrfToken } from "@/lib/utils/csrf";

export const dynamic = "force-dynamic";

/**
 * GDPR erasure: permanently delete the account and all of its data.
 *
 * The session cookie is not proof that the account holder asked for this. It
 * is ambient — every request carries it, including one a script on another
 * origin could not make but a script *inside* the page (XSS) can. So this
 * route asks for two things Auth.js's own `signOut` asks for one of: the CSRF
 * token that proves the request came from a page that could read our cookie,
 * and, for an account that has a password, the password itself — the one
 * credential that a stolen session does not carry.
 *
 * Both are enforced on every call, which is why the token and the password are
 * asked for even though the cookie is `HttpOnly; SameSite=Lax` and a cross-site
 * `DELETE` could not have issued the request in the first place: an XSS or a
 * same-site foothold would change that, and the control costs one extra field.
 */
export async function DELETE(req: Request) {
  try {
    const userId = await requireSessionForWrite("account");

    const body = (await req.json().catch(() => null)) as {
      csrfToken?: unknown;
      password?: unknown;
    } | null;

    if (!verifyCsrfToken(req, body?.csrfToken)) {
      return jsonError(
        403,
        "Missing or invalid CSRF token — reload the page and try again",
        "INVALID_CSRF_TOKEN",
      );
    }

    // A closed-registration instance has exactly one account, so deleting it
    // would leave nobody able to sign in — the instance would be bricked with no
    // way back short of editing the database. The settings page hides the
    // button; this is the guard that makes it true.
    // Read fresh rather than from the cached config: this is a guard, and a
    // stale "registration is open" is the direction that deletes somebody's
    // only account. The settings page only decides whether to *offer* the
    // button, so a cached answer there is harmless.
    //
    // One flag, not `readConfig()`: that judges the whole deployment, including
    // email, and a rotated Resend key should not turn a delete attempt into a
    // 500. `registrationOpen()` fails closed, which is the safe direction for a
    // destructive endpoint — and it is the same reader the sign-up route uses,
    // so the policy lives in one place.
    if (!registrationOpen()) {
      return jsonError(
        403,
        "This instance has a single account — deleting it would lock everyone out. Export your data instead.",
        "ACCOUNT_DELETION_DISABLED",
      );
    }

    // Provider-only accounts have no password to prove; the CSRF token above is
    // the whole check for them.
    if (await hasPassword(userId)) {
      if (typeof body?.password !== "string" || body.password.length === 0) {
        return jsonError(
          400,
          "Enter your password to delete this account",
          "PASSWORD_REQUIRED",
        );
      }
      await verifyPassword(userId, body.password);
    }

    await deleteAccount(userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
