import { NextResponse } from "next/server";
import { changePassword } from "@/lib/services/account";
import { changePasswordSchema } from "@/lib/utils/validation";
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

export async function POST(req: Request) {
  try {
    const userId = await requireSession();

    const rl = rateLimit(getClientIp(req), "change-password");
    if (!rl.ok) return rateLimited(rl.retryAfterSeconds);

    const body = await req.json().catch(() => null);
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        400,
        "Invalid request payload",
        "VALIDATION_ERROR",
        parsed.error.flatten(),
      );
    }
    await changePassword(
      userId,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );
    rateLimitSuccess(getClientIp(req), "change-password");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
