import { NextResponse } from "next/server";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { loginSchema } from "@/lib/utils/validation";
import {
  handleRouteError,
  jsonError,
  rateLimited,
  readJsonBody,
  requireJsonBody,
} from "@/lib/utils/api";
import {
  getClientIp,
  rateLimit,
  rateLimitSuccess,
} from "@/lib/utils/rate-limit";
import {
  clearLoginFailures,
  loginThrottleRetryAfter,
} from "@/lib/auth/login-throttle";
import { logAuthEvent } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const notJson = requireJsonBody(req);
    if (notJson) return notJson;

    const ip = getClientIp(req);
    const rl = rateLimit(ip, "login");
    if (!rl.ok) return rateLimited(rl.retryAfterSeconds);

    const body = await readJsonBody(req);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        400,
        "Invalid request payload",
        "VALIDATION_ERROR",
        parsed.error.flatten(),
      );
    }

    // The per-account and process-wide counters are consumed inside the
    // Credentials `authorize()` callback, not here. Auth.js serves the same
    // credential check from `/api/auth/callback/credentials`, which never runs
    // this route — a limit kept here is a limit an attacker walks around by
    // using that path (measured: 20 failures through the callback, each
    // answered `CredentialsSignin`, while this route was answering `429`). One
    // counter in one place is also what stops a single attempt being counted
    // twice, which would silently halve the configured allowance.
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
        // The callback refused it; ask whether a counter is what refused it, so
        // the answer is a `429` with the wait rather than a bare `401`.
        // Peek-only — the attempt was already counted where it was made.
        const retryAfter = loginThrottleRetryAfter(parsed.data.email);
        if (retryAfter !== null) return rateLimited(retryAfter);
        return jsonError(401, "Invalid email or password", "INVALID_CREDENTIALS");
      }
      throw error;
    }

    // Success: reset both windows so only failures accumulate.
    rateLimitSuccess(ip, "login");
    clearLoginFailures(parsed.data.email);
    logAuthEvent("login_success", { ip, email: parsed.data.email });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
