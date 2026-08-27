import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "@/lib/auth";
import { rateLimitAccount } from "./rate-limit";
import { logger } from "./logger";

/** Consistent API error shape: { error, code, details? }. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function jsonError(
  status: number,
  message: string,
  code: string,
  details?: unknown,
  headers?: Record<string, string>,
): NextResponse {
  const body: Record<string, unknown> = { error: message, code };
  if (details !== undefined) body.details = details;
  return NextResponse.json(body, { status, headers });
}

const DB_UNAVAILABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "57P03", // cannot_connect_now
  "08P01", // protocol violation
  "53300", // too many connections
]);

/** Central error → response mapping. Never leaks stack traces in production. */
export function handleRouteError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return jsonError(err.status, err.message, err.code, err.details);
  }
  if (err instanceof ZodError) {
    return jsonError(
      400,
      "Invalid request payload",
      "VALIDATION_ERROR",
      err.flatten(),
    );
  }
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    DB_UNAVAILABLE_CODES.has(String((err as { code: unknown }).code))
  ) {
    return jsonError(
      503,
      "Database temporarily unavailable",
      "DB_UNAVAILABLE",
      undefined,
      { "Retry-After": "5" },
    );
  }
  logger.error({ err }, "unhandled route error");
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err instanceof Error
        ? err.message
        : "Internal server error";
  return jsonError(500, message, "INTERNAL_ERROR");
}

/** Guard: every API route must call this first. Returns the user id. */
export async function requireSession(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new ApiError(401, "Unauthorized", "UNAUTHORIZED");
  }
  return userId;
}

/**
 * Guard for state-changing (write) endpoints: per-user throttle, keyed by
 * user id so it works behind NAT / spoofed IPs. Default 300 writes/hour —
 * generous enough for bulk entry of applications (a real job-seeker can
 * add dozens in a sitting) while still stopping automated abuse of a
 * stolen session. Override via RATE_LIMIT_WRITES_MAX /
 * RATE_LIMIT_WRITES_WINDOW_MINUTES.
 */
export async function requireSessionForWrite(scope: string): Promise<string> {
  const userId = await requireSession();
  const max = Number(process.env.RATE_LIMIT_WRITES_MAX ?? 300);
  const windowMinutes = Number(process.env.RATE_LIMIT_WRITES_WINDOW_MINUTES ?? 60);
  const rl = rateLimitAccount(userId, `write:${scope}`, {
    max,
    windowMs: windowMinutes * 60_000,
  });
  if (!rl.ok) {
    throw new ApiError(
      429,
      "Too many requests, please try again later",
      "RATE_LIMITED",
      undefined,
    );
  }
  return userId;
}

/** 429 response with Retry-After (spec: 60s default). */
export function rateLimited(retryAfterSeconds: number): NextResponse {
  return jsonError(
    429,
    "Too many attempts, please try again later",
    "RATE_LIMITED",
    undefined,
    { "Retry-After": String(Math.max(1, retryAfterSeconds)) },
  );
}
