import pino from "pino";

/**
 * Structured JSON logger. Errors include stack traces but never user data.
 *
 * Plain JSON output (no pretty transport): thread-stream worker files are not
 * resolvable inside Next.js's webpack bundle, which crashes the dev server.
 * For readable local logs, pipe through pino-pretty instead:
 *
 *   pnpm dev | pnpm exec pino-pretty
 */
const isProd = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
});

/** Log an auth-relevant event (IP, email, timestamp) for abuse detection. */
export function logAuthEvent(
  event: "login_success" | "login_failure" | "register" | "password_reset",
  meta: { ip?: string; email?: string; reason?: string },
) {
  logger.info({ event, ...meta, ts: new Date().toISOString() }, `auth:${event}`);
}
