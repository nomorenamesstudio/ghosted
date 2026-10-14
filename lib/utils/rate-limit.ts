/**
 * In-memory sliding-window rate limiter.
 *
 * - Buckets are keyed by scope + identity (IP and/or account), so a login
 *   attempt does not consume the register/forgot-password budget and vice
 *   versa.
 * - Successful attempts reset the bucket (see `rateLimitSuccess`), so a
 *   legitimate user is never locked out by their own successful requests.
 * - MVP note: buckets live in process memory, so they reset on server
 *   restart and do not scale across multiple instances. For multi-instance
 *   production, back this with Redis.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Prune so the map cannot grow without bound.
 *
 * Identities are attacker-chosen — an email address, an IP, an account id — so
 * "the map only grows as large as the traffic" is not a bound. Expired buckets
 * go first. If the map is *still* full, the oldest windows are dropped in one
 * batch rather than one per insert: a full map plus a sort per request would
 * make every new identity cost O(n log n), which is its own denial of service.
 */
const MAX_BUCKETS = 10_000;
function pruneIfNeeded(): void {
  if (buckets.size < MAX_BUCKETS) return;

  const now = Date.now();
  for (const [key, b] of Array.from(buckets.entries())) {
    if (b.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size < MAX_BUCKETS) return;

  // Drop the oldest tenth. Losing a live window is the cost of an attacker
  // filling the map; it can only ever make a limit more permissive for
  // identities that were closest to expiry anyway.
  const byExpiry = Array.from(buckets.entries()).sort(
    (a, b) => a[1].resetAt - b[1].resetAt,
  );
  const drop = Math.max(1, Math.floor(MAX_BUCKETS / 10));
  for (let i = 0; i < drop && i < byExpiry.length; i++) {
    buckets.delete(byExpiry[i][0]);
  }
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
}

function limits(overrides?: { max?: number; windowMs?: number }) {
  const max = Math.max(
    1,
    overrides?.max ?? Number(process.env.RATE_LIMIT_MAX ?? 5),
  );
  const windowMs =
    Math.max(
      1,
      (overrides?.windowMs ??
        Number(process.env.RATE_LIMIT_WINDOW_MINUTES ?? 15)) * 60_000,
    );
  return { max, windowMs };
}

/** Rate-limit by identity (IP or account id) within a named scope. */
export function rateLimit(
  identity: string,
  scope = "default",
  overrides?: { max?: number; windowMs?: number },
): RateLimitResult {
  const { max, windowMs } = limits(overrides);
  const now = Date.now();
  const key = `${scope}:${identity || "unknown"}`;

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    pruneIfNeeded();
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > max) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

/**
 * The same question without consuming anything: "is this identity over its
 * limit right now, and for how long?"
 *
 * A caller that checks a limit in one place and consumes it in another (the
 * login route checks the IP, the Credentials callback checks the account)
 * needs a read that does not add a second count. Counting twice would halve
 * the configured allowance without anyone changing it.
 */
export function rateLimitStatus(
  identity: string,
  scope = "default",
  overrides?: { max?: number; windowMs?: number },
): RateLimitResult {
  const { max } = limits(overrides);
  const now = Date.now();
  const bucket = buckets.get(`${scope}:${identity || "unknown"}`);
  if (!bucket || bucket.resetAt <= now) {
    return { ok: true, retryAfterSeconds: 0 };
  }
  if (bucket.count > max) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

/** Header-independent per-account throttle (e.g. by email or user id). */
export function rateLimitAccount(
  account: string,
  scope = "default",
  overrides?: { max?: number; windowMs?: number },
): RateLimitResult {
  return rateLimit(account, `acct:${scope}`, overrides);
}

/**
 * Call after a *successful* attempt so the window starts fresh — only failed
 * attempts accumulate towards the limit.
 */
export function rateLimitSuccess(identity: string, scope = "default"): void {
  buckets.delete(`${scope}:${identity}`);
}

/**
 * Best-effort client IP extraction, in order of how much can be trusted.
 *
 * `x-forwarded-for` cannot be trusted here, and the earlier version of this
 * function got it exactly backwards: it took the *last* entry on the theory
 * that the trusted edge appends the address it saw. Measured against the
 * production origin on 2026-10-14, nothing appends — the header arrives
 * exactly as the client sent it, so the last entry is the attacker's string
 * and a fresh value starts a fresh bucket (see the pentest report in
 * docs/reviews/). Any single-valued header is equally forgeable on an origin
 * that can be reached directly; the difference is that the ones below are
 * written by an edge that overwrites what the client sent.
 *
 *  1. `cf-connecting-ip` — set by Cloudflare, which replaces a client-supplied
 *     copy. This is the correct address for traffic through the edge.
 *  2. `x-real-ip` — the single-value header nginx and most self-hosted proxies
 *     set (`proxy_set_header X-Real-IP $remote_addr`).
 *  3. the last `x-forwarded-for` entry — kept for deployments that terminate
 *     their own proxy and append, and known-spoofable everywhere else.
 *  4. `"unknown"` — no header at all. Every such request shares one bucket,
 *     which is the safe direction to fail in.
 *
 * The per-IP limit is therefore a best-effort signal and never the only thing
 * standing between an attacker and an account: the per-account counter and the
 * global failure cap in lib/auth/login-throttle.ts are header-independent.
 */
export function getClientIp(req: Request): string {
  const cloudflare = req.headers.get("cf-connecting-ip");
  if (cloudflare?.trim()) return cloudflare.trim();

  const real = req.headers.get("x-real-ip");
  if (real?.trim()) return real.trim();

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const entries = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (entries.length > 0) return entries[entries.length - 1];
  }
  return "unknown";
}
