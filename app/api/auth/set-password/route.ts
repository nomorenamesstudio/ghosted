import { NextResponse } from "next/server";
import { setPassword } from "@/lib/services/account";
import { setPasswordSchema } from "@/lib/utils/validation";
import {
  handleRouteError,
  jsonError,
  rateLimited,
  requireSession,
} from "@/lib/utils/api";
import {
  getClientIp,
  rateLimit,
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

    const body = await req.json().catch(() => null);
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
    rateLimitSuccess(getClientIp(req), "set-password");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
