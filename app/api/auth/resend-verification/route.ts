import { NextResponse } from "next/server";
import { issueEmailVerification } from "@/lib/services/account";
import { sendVerificationEmail } from "@/lib/emails";
import {
  handleRouteError,
  rateLimited,
  requireSession,
} from "@/lib/utils/api";
import { getClientIp, rateLimit } from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";

/** (Re)send the email-verification link for the signed-in user. */
export async function POST(req: Request) {
  try {
    const userId = await requireSession();

    const rl = rateLimit(getClientIp(req));
    if (!rl.ok) return rateLimited(rl.retryAfterSeconds);

    const { raw, email } = await issueEmailVerification(userId);
    await sendVerificationEmail(email, raw);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
