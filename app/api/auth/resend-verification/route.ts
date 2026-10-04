import { NextResponse } from "next/server";
import { issueEmailVerification } from "@/lib/services/account";
import { sendVerificationEmail } from "@/lib/emails";
import {
  handleRouteError,
  rateLimited,
  requireSession,
} from "@/lib/utils/api";
import {
  getClientIp,
  rateLimit,
  rateLimitAccount,
} from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";

/** (Re)send the email-verification link for the signed-in user. */
export async function POST(req: Request) {
  try {
    const userId = await requireSession();

    const rl = rateLimit(getClientIp(req), "resend-verification");
    if (!rl.ok) return rateLimited(rl.retryAfterSeconds);
    // Per-account throttle: one verification email per window per user,
    // independent of the IP header.
    const acct = rateLimitAccount(userId, "resend-verification");
    if (!acct.ok) return rateLimited(acct.retryAfterSeconds);

    const { raw, email } = await issueEmailVerification(userId);
    const delivered = await sendVerificationEmail(email, raw);

    // The user is signed in and knows their own address, so reporting a send
    // failure reveals nothing they do not already know — and saying "sent" when
    // the provider refused it is how someone waits all afternoon for a mail
    // that was never accepted. The reason itself stays in the server log.
    if (!delivered) {
      return NextResponse.json(
        { error: "The email provider refused the message — check the server log, then try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
