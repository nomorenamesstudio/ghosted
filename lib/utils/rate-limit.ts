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

/** Prune expired buckets periodically so the map cannot grow unbounded. */
const MAX_BUCKETS = 10_000;
function pruneIfNeeded(): void {
  if (buckets.size < MAX_BUCKETS) return;
  const now = Date.now();
  for (const [key, b] of Array.from(buckets.entries())) {
    if (b.resetAt <= now) buckets.delete(key);
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
 * Best-effort client IP extraction.
 *
 * Trusted proxies (e.g. Railway's edge) append the real client IP to
 * `x-forwarded-for`; the client can only *prepend* values, so the LAST
 * entry is the one the trusted edge wrote and is the one we trust.
 * `x-real-ip` is honored as a fallback when the forwarding header is absent.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const entries = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (entries.length > 0) return entries[entries.length - 1];
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}
