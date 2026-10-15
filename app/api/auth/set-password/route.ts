import { NextResponse } from "next/server";
import { setPassword } from "@/lib/services/account";
import { setPasswordSchema } from "@/lib/utils/validation";
import {
  handleRouteError,
  jsonError,
  rateLimited,
  readJsonBody,
  requireSession,
} from "@/lib/utils/api";
import {
  getClientIp,
  rateLimit,
  rateLimitAccount,
  rateLimitSuccess,
} from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The first password for an account that signs in with Google or LinkedIn only.
 * The session is the proof of identity here — there is no current password to
 * ask for — and the service refuses an account that already has one.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireSession();

    const rl = rateLimit(getClientIp(req), "set-password");
    if (!rl.ok) return rateLimited(rl.retryAfterSeconds);

    // Beside the per-IP window, one keyed to the account. The IP window is per
    // address, so an attacker holding a session and a pool of addresses walks
    // past it; the account is what is actually being guessed at. `docs/API.md`
    // promised "per IP and per user" here and only the IP half existed.
    const account = rateLimitAccount(userId, "set-password");
    if (!account.ok) return rateLimited(account.retryAfterSeconds);

    const body = await readJsonBody(req);
    const parsed = setPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        400,
        "Invalid request payload",
        "VALIDATION_ERROR",
        parsed.error.flatten(),
      );
    }
    await setPassword(userId, parsed.data.newPassword);
    // Only the account's own window resets on success. Clearing the per-IP
    // bucket here would hand the allowance back to everyone behind that address
    // — a shared NAT, an office, an attacker with several accounts on one host.
    rateLimitSuccess(userId, "acct:set-password");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
