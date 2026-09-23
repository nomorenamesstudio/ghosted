import { logger } from "@/lib/utils/logger";
import {
  acceptGravatarResponse,
  gravatarHash,
  gravatarPath,
  gravatarUpstreamUrl,
} from "@/lib/utils/gravatar";

/**
 * Does this email have a Gravatar?
 *
 * Asked once, at sign-in (`lib/auth.ts`), and the answer is then carried in the
 * session as `user.image`. A hit yields our own `/avatars/<hash>` path — the
 * browser never talks to gravatar.com — and a miss yields null, which leaves
 * `user.image` unset so the menu keeps rendering its initials. Resolving here
 * rather than per render means a user with no Gravatar produces no image
 * request at all, and a user with one re-checks only when they sign in again.
 *
 * Never throws: the avatar is decoration, and a lookup failure must not fail a
 * sign-in.
 */

const FETCH_TIMEOUT_MS = 3_000;

export async function resolveGravatarPath(
  email: string,
): Promise<string | null> {
  try {
    const hash = gravatarHash(email);
    const res = await fetch(gravatarUpstreamUrl(hash), {
      // Fixed host, hash derived from the customer's own email — no
      // user-supplied URL, so there is no SSRF surface.
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": "Ghosted/0.1 (gravatar lookup)" },
    });
    const bytes = Buffer.from(await res.arrayBuffer());
    const contentType = acceptGravatarResponse(
      res.status,
      res.headers.get("content-type"),
      bytes.length,
    );
    return contentType ? gravatarPath(hash) : null;
  } catch (err) {
    logger.warn({ err }, "gravatar lookup failed");
    return null;
  }
}
