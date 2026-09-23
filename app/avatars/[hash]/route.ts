import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import {
  acceptGravatarResponse,
  GRAVATAR_HASH_RE,
  GRAVATAR_SIZE,
  gravatarUpstreamUrl,
} from "@/lib/utils/gravatar";

/**
 * Gravatar for one email hash, e.g. `/avatars/<md5>`.
 *
 * Served from our own origin for the same reasons as `/logos/<id>` — the user's
 * address is not handed to a third party on every render, and a Gravatar that
 * disappears upstream keeps working — plus one of its own: Gravatar's cache is
 * only `max-age=300`, so hotlinking it makes every browser re-ask them every
 * five minutes. Here the bytes are cached for a week instead.
 *
 * `d=404` is what makes the fallback honest: no avatar upstream means a 404
 * here, and Radix's `AvatarFallback` then shows the user's initials exactly as
 * it did before this route existed.
 *
 * Deliberately NOT under `/api`: middleware.ts puts `no-store` on every
 * `/api/*` response to stop an authenticated JSON response being served to the
 * next user of the same browser. Avatar bytes must stay cacheable, so they live
 * outside that prefix and keep the guard intact.
 */

export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 5_000;

/**
 * A week, not a year: the hash in the URL is stable, but a user who changes
 * their Gravatar picture should not be stuck with the old one indefinitely.
 */
const HIT_CACHE = "private, max-age=604800, stale-while-revalidate=86400";

/** Retry a miss sooner — an account can be created on Gravatar at any time. */
const MISS_CACHE = "private, max-age=3600";

function miss(): NextResponse {
  return new NextResponse(null, {
    status: 404,
    headers: { "cache-control": MISS_CACHE },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: { hash: string } },
) {
  try {
    const hash = params.hash.toLowerCase();
    if (!GRAVATAR_HASH_RE.test(hash)) return miss();

    // Not a security boundary (a Gravatar is public by construction, and the
    // hash is derivable from any address), but it keeps this from being an
    // open image relay for anyone who finds the hostname.
    const session = await auth();
    if (!session?.user?.id) return miss();

    const res = await fetch(gravatarUpstreamUrl(hash, GRAVATAR_SIZE), {
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
    if (!contentType) return miss();

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": contentType,
        "content-length": String(bytes.length),
        "cache-control": HIT_CACHE,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    // An avatar is decoration: never turn a lookup failure into a broken page.
    logger.warn({ err, hash: params.hash }, "gravatar fetch failed");
    return miss();
  }
}
