import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "@/lib/auth";
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
