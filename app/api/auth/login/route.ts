import { NextResponse } from "next/server";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { loginSchema } from "@/lib/utils/validation";
import {
  handleRouteError,
  jsonError,
  rateLimited,
} from "@/lib/utils/api";
import {
  getClientIp,
  rateLimit,
  rateLimitAccount,
  rateLimitSuccess,
} from "@/lib/utils/rate-limit";
import { logAuthEvent } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit(ip, "login");
    if (!rl.ok) return rateLimited(rl.retryAfterSeconds);

    const body = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        400,
        "Invalid request payload",
        "VALIDATION_ERROR",
        parsed.error.flatten(),
      );
    }

    // Header-independent per-account throttle: stops password-stuffing even
    // when the IP header is spoofed or shared behind NAT.
    const acct = rateLimitAccount(parsed.data.email, "login");
    if (!acct.ok) return rateLimited(acct.retryAfterSeconds);

    try {
      await signIn("credentials", {
        email: parsed.data.email,
        password: parsed.data.password,
        redirect: false,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        logAuthEvent("login_failure", {
          ip,
          email: parsed.data.email,
          reason: error.type,
        });
        return jsonError(401, "Invalid email or password", "INVALID_CREDENTIALS");
      }
      throw error;
    }

    // Success: reset both windows so only failures accumulate.
    rateLimitSuccess(ip, "login");
    rateLimitSuccess(parsed.data.email, "acct:login");
    logAuthEvent("login_success", { ip, email: parsed.data.email });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
