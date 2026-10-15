import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
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
  const user = await getCurrentUser();
  if (!user) {
    throw new ApiError(401, "Unauthorized", "UNAUTHORIZED");
  }
  return user.id;
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
  const user = await getCurrentUser();
  if (!user) {
    throw new ApiError(401, "Unauthorized", "UNAUTHORIZED");
  }
  // A credential the operator did not choose buys exactly one thing: the chance
  // to replace it. Reads still work — the dashboard has to render for the user to
  // find the form — but every mutation is refused until then, which is what
  // makes "forced" true rather than advisory.
  if (user.mustChangePassword) {
    throw new ApiError(
      403,
      "Choose your own password before continuing.",
      "PASSWORD_CHANGE_REQUIRED",
    );
  }
  const userId = user.id;
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

/**
 * Read a JSON request body with a cap, because `req.json()` takes whatever the
 * client sends: a 200 MB body is held in memory before any schema sees it, so
 * the validation caps downstream only measure something already buffered
 * (static audit, first pass: thirteen call sites, none of them bounded).
 *
 * The cap sits far above the largest legitimate payload — the whole create/update
 * schema tops out around 15 KB of text — and the import route keeps its own,
 * larger bound. Over the cap is a 413, not a 400: "too large" is not "malformed",
 * and the caller's `handleRouteError` already turns an ApiError into its status.
 * Returns null for an empty or unparseable body, which is what the call sites
 * did with `req.json().catch(() => null)`.
 */
export const MAX_JSON_BYTES = 64 * 1024;

export async function readJsonBody(
  req: Request,
  maxBytes = MAX_JSON_BYTES,
): Promise<unknown | null> {
  const declared = req.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) {
    throw new ApiError(413, "Request body too large", "PAYLOAD_TOO_LARGE");
  }
  const reader = req.body?.getReader();
  if (!reader) return null;

  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new ApiError(413, "Request body too large", "PAYLOAD_TOO_LARGE");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    if (!reader.closed) reader.releaseLock();
  }

  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Refuse a body that is not JSON.
 *
 * A cross-site HTML form can post `text/plain` or form-encoded data without a
 * preflight, and these routes mint sessions — so an attacker could sign a
 * visitor into an account they control (login CSRF) without ever reading a
 * response. Requiring a media type a form cannot send closes it for the cost of
 * one header check; the real form and every test send `application/json`.
 */
export function requireJsonBody(req: Request): NextResponse | null {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("application/json")) return null;
  return jsonError(
    415,
    "Send this request as application/json",
    "UNSUPPORTED_MEDIA_TYPE",
  );
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
