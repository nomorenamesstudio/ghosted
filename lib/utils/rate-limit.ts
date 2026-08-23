/**
 * In-memory sliding-window rate limiter (per IP).
 *
 * MVP note: buckets live in process memory, so they reset on server restart
 * and do not scale across multiple instances. For a single-user personal app
 * this is acceptable; for production multi-instance use, back this with Redis.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
}

export function rateLimit(ip: string): RateLimitResult {
  const max = Number(process.env.RATE_LIMIT_MAX ?? 5);
  const windowMs =
    Number(process.env.RATE_LIMIT_WINDOW_MINUTES ?? 15) * 60_000;
  const now = Date.now();
  const key = ip || "unknown";

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
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

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
