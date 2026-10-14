import {
  rateLimit,
  rateLimitAccount,
  rateLimitStatus,
  rateLimitSuccess,
  type RateLimitResult,
} from "@/lib/utils/rate-limit";

/**
 * The sign-in throttle, in one place.
 *
 * Two counters, both counting **failures only**, and both independent of
 * request headers:
 *
 * - **Per account** (`accountThrottle` / `recordLoginFailure`). The counter that
 *   stops password guessing against a known address. It has to be enforced
 *   inside the Credentials `authorize()` callback rather than in the route
 *   handler that fronts it: Auth.js serves the same credential check from
 *   `/api/auth/callback/credentials`, which never runs the route, so a limit
 *   that lives only in `/api/auth/login` is a limit an attacker walks around.
 *   Measured on the 2026-10-14 pentest: 20 consecutive failures through the
 *   callback answered `CredentialsSignin` every time while the route was
 *   answering `429`.
 * - **Process-wide** (`globalThrottle`). The per-IP counter cannot be defended
 *   while `x-forwarded-for` reaches the app unverified (see `getClientIp`), so
 *   spraying one password across many accounts would otherwise be unlimited —
 *   each account's own window starts fresh. This caps it.
 *
 * Two properties of the split matter, and both were wrong in the first version
 * of this file (a static audit caught them the same day):
 *
 * 1. **Nothing is counted before the password is proven.** The check is a peek
 *    and the write happens only on a failed compare, so an account's own
 *    successful sign-ins can neither exhaust its budget nor be refused by it.
 *    Counting every attempt meant five *correct* sign-ins locked an account out
 *    of its own account.
 * 2. **A success clears the account's window** — and it has to clear the key the
 *    counter actually writes (`acct:login:<address>`), not a near-miss of it.
 *
 * What this cannot fix, and does not pretend to: refusing before the compare is
 * the only thing that bounds guessing, so five anonymous attempts against a
 * known address still hold its owner out for the rest of the window. That is a
 * deliberate trade — a limit that only refused wrong passwords would not limit
 * anything — and it is recorded in SECURITY.md alongside the process-wide cap's
 * own lockout.
 *
 * Not persistent and not shared between processes: both counters live in this
 * process's memory, so they reset on restart and are per replica. That is the
 * documented MVP limitation in lib/utils/rate-limit.ts, not a property of the
 * policy here.
 */

/** Bucket scope for the per-account counter, including the `acct:` prefix. */
const ACCOUNT_SCOPE = "acct:login";

/** Identity and scope of the process-wide failure cap. */
const GLOBAL_IDENTITY = "all";
const GLOBAL_SCOPE = "login-failures";

/** Overrides for the global cap, read per call so a test can tighten them. */
function globalLimits(): { max: number; windowMs: number } {
  return {
    max: Math.max(1, Number(process.env.RATE_LIMIT_LOGIN_FAILURES_MAX ?? 100)),
    windowMs:
      Math.max(
        1,
        Number(process.env.RATE_LIMIT_LOGIN_FAILURES_WINDOW_MINUTES ?? 15),
      ) * 60_000,
  };
}

/**
 * Whether this address may attempt a sign-in right now. A peek: it neither
 * spends the budget nor answers "was the password right".
 */
export function accountThrottle(email: string): RateLimitResult {
  return rateLimitStatus(email, ACCOUNT_SCOPE);
}

/** Peek at the process-wide cap without counting an attempt. */
export function globalThrottle(): RateLimitResult {
  return rateLimitStatus(GLOBAL_IDENTITY, GLOBAL_SCOPE, globalLimits());
}

/**
 * Count one failed credential check against both counters. Call it *after* the
 * compare failed, never before it.
 *
 * The global counter is deliberately not cleared by a successful sign-in: one
 * valid login would then erase whatever an attacker had accumulated, and the cap
 * exists for the traffic that never signs in.
 */
export function recordLoginFailure(email: string): void {
  rateLimitAccount(email, "login");
  rateLimit(GLOBAL_IDENTITY, GLOBAL_SCOPE, globalLimits());
}

/** Clear the account's failure window — call after a successful sign-in. */
export function clearLoginFailures(email: string): void {
  rateLimitSuccess(email, ACCOUNT_SCOPE);
}

/**
 * How long this attempt should be refused for, or `null` when it may proceed.
 *
 * Peek-only: every failure has already been counted where it happened, so a
 * caller asking "was that the one over the line?" must not spend again.
 */
export function loginThrottleRetryAfter(email: string): number | null {
  const waits = [accountThrottle(email), globalThrottle()]
    .filter((result) => !result.ok)
    .map((result) => result.retryAfterSeconds);
  return waits.length > 0 ? Math.max(...waits) : null;
}
