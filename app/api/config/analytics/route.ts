import { NextResponse } from "next/server";
import { siteIdentity } from "@/lib/site";

/**
 * The deployment's own answer to "does this instance report anywhere?".
 *
 * It exists so that the tracker can be attached at runtime by
 * `components/Analytics.tsx` instead of being baked into prerendered HTML: the
 * hosted instance answers with its own tracker, a self-hosted copy answers 204
 * and loads nothing. The values are public by nature — they are the same two
 * strings that used to sit in the page source — so nothing here is a secret,
 * and the response is explicitly uncacheable so flipping the environment takes
 * effect on the next load rather than whenever a cache expires.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const { umami } = siteIdentity();

  if (!umami) {
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json(umami, { headers: { "Cache-Control": "no-store" } });
}
