import { createHash, timingSafeEqual } from "node:crypto";
import { logger } from "./logger";

/**
 * Auth.js's CSRF check, for our own route handlers.
 *
 * Auth.js guards every action it owns (`signOut` among them) with a
 * double-submit token: `GET /api/auth/csrf` sets a cookie whose value is
 * `token|sha256(token + AUTH_SECRET)`, and the action must send the bare
 * `token` back. The cookie proves the token was minted by this server (the
 * client cannot forge the hash without the secret), and matching it against
 * the value in the request proves the request came from a page that could read
 * that cookie — which a hostile origin cannot, because cookies are sent per
 * origin and `SameSite=Lax` withholds them from a cross-site `fetch`.
 *
 * The account-deletion route is ours rather than Auth.js's, so it has to ask
 * the same question itself. Verified against @auth/core 0.41.3's
 * `createCSRFToken`, including the cookie names and the hash: the digest is
 * SHA-256 over `token + secret`, hex-encoded, and the cookie may carry the
 * `__Host-`/`__Secure-` prefix when the deployment runs on https.
 *
 * Deliberately a plain function rather than middleware: it fails closed, and
 * one destructive route is the whole point of having it.
 */

const CSRF_COOKIE_NAMES = [
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "__Secure-authjs.csrf-token",
];

/** Length-independent, timing-safe comparison of two strings. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

function csrfSecret(): string | null {
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? null;
}

/**
 * True when the request carries a valid Auth.js CSRF token.
 *
 * The token travels in the request body (how Auth.js itself receives it);
 * `submitted` is whatever the caller read, so the caller decides which field
 * it comes from.
 */
export function verifyCsrfToken(req: Request, submitted: unknown): boolean {
  if (typeof submitted !== "string" || submitted.length === 0) return false;

  const secret = csrfSecret();
  if (!secret) {
    // No secret means no way to tell a minted token from a forged one. Refuse
    // — a destructive route is the wrong place to guess.
    logger.error("csrf: AUTH_SECRET is not set, refusing the request");
    return false;
  }

  const cookieHeader = req.headers.get("cookie");
  for (const name of CSRF_COOKIE_NAMES) {
    const raw = readCookie(cookieHeader, name);
    if (!raw) continue;

    // The cookie arrives percent-encoded, because the value carries a `|` and
    // Next's serializer escapes it (`…%7C…`). Splitting the raw value finds no
    // separator at all, which is what "Missing or invalid CSRF token" in a real
    // browser and a green unit test looked like at the same time: the test built
    // the cookie by hand, in the shape this code expected rather than the shape
    // the framework produces. Decoding first is what @auth/core's own cookie
    // reader does.
    let value: string;
    try {
      value = decodeURIComponent(raw);
    } catch {
      continue; // malformed encoding is not a token
    }

    const [cookieToken, cookieHash] = value.split("|");
    if (!cookieToken || !cookieHash) continue;

    const expected = createHash("sha256")
      .update(`${cookieToken}${secret}`)
      .digest("hex");
    if (!safeEqual(cookieHash, expected)) continue;

    // The cookie is ours; the request must name the same token, which means it
    // came from a page that could read this cookie.
    if (safeEqual(submitted, cookieToken)) return true;
  }

  return false;
}
