import { createHash } from "node:crypto";

/**
 * Gravatar addressing for email/password users.
 *
 * Gravatar is keyed by the MD5 of a lowercased, trimmed email address, so that
 * hash — never the address itself — is what appears in every URL we build.
 *
 * Only accounts that actually exist are used: `d=404` makes Gravatar answer
 * 404 instead of substituting a placeholder, so a user without a Gravatar keeps
 * the initials fallback the menu already renders. Nothing here is decorative
 * filler.
 *
 * This module is pure (no network, no DB) so the URL shape stays unit-testable;
 * the fetch lives in `lib/services/gravatar.ts`.
 */

/**
 * Size asked of Gravatar, in pixels. At 160px the source stays sharp behind a
 * 36px avatar on a 4x display while the payload stays around 10KB.
 */
export const GRAVATAR_SIZE = 160;

/** Gravatar hashes are MD5 hex — 32 lowercase hex characters, nothing else. */
export const GRAVATAR_HASH_RE = /^[0-9a-f]{32}$/;

/** Upper bound on an avatar we are willing to store: well past a 2048px PNG. */
const MAX_BYTES = 512 * 1024;

/**
 * Content types we are willing to re-serve from our own origin. SVG is
 * deliberately absent for the same reason as in `company-logos.ts`: serving
 * third-party SVG same-origin is a script-execution path, and Gravatar never
 * returns it anyway.
 */
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

/** MD5 of the trimmed, lowercased address — the Gravatar identity. */
export function gravatarHash(email: string): string {
  return createHash("md5").update(email.trim().toLowerCase()).digest("hex");
}

/** The gravatar.com URL, always with `d=404` (404 on "no such avatar"). */
export function gravatarUpstreamUrl(
  hash: string,
  size: number = GRAVATAR_SIZE,
): string {
  return `https://www.gravatar.com/avatar/${hash}?d=404&s=${size}&r=g`;
}

/** Our own-origin path for that avatar — see `app/avatars/[hash]/route.ts`. */
export function gravatarPath(hash: string): string {
  return `/avatars/${hash}`;
}

/**
 * Decide whether an upstream response is a usable avatar, returning the content
 * type to serve it as.
 *
 * The status code alone is not enough: a 200 with an HTML error page or a
 * zero-byte body would otherwise be cached and served as an image.
 */
export function acceptGravatarResponse(
  status: number,
  contentType: string | null,
  byteLength: number,
): string | null {
  if (status !== 200) return null;
  if (byteLength <= 0 || byteLength > MAX_BYTES) return null;
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return ALLOWED_TYPES[type] ?? null;
}
