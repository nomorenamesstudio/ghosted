import { NextResponse, type NextRequest } from "next/server";
import { readBooleanFlagRaw } from "@/lib/config/flag-parse";

/**
 * Lenient on purpose: this runs on every request, so a typo must not become a
 * 500 for the whole site. The same typo stops the app where the configuration
 * is actually validated (`lib/config/flags.ts`), which is why both read the
 * value through the same parser.
 */
function flag(raw: string | undefined, fallback: boolean): boolean {
  const read = readBooleanFlagRaw(raw);
  return read.kind === "value" ? read.value : fallback;
}

/**
 * The decisions that belong to the deployment rather than to a page.
 *
 * They live here because middleware runs per request and reads the live
 * environment, while pages can be prerendered: a build cannot know how the
 * image it produced will be configured, and a published image that answered
 * these questions at build time would answer them for every instance that
 * pulled it.
 *
 * Three jobs:
 *
 * 1. `/` goes to the sign-in screen when the landing is switched off. Read at
 *    request time so `SHOW_LANDING=false` works on a prerendered landing.
 * 2. `X-Robots-Tag: noindex` for an instance that is not meant to be found. This
 *    is the crawl control that still works for a page a build could not decide
 *    about; `robots.txt` and the sitemap say the same thing from their own
 *    routes. `SITE_INDEXABLE` defaults to the deployment shape, exactly as
 *    `lib/site.ts` reads it — the hosted instance is meant to be found, a
 *    self-hosted one is private unless it says otherwise.
 * 3. `Cache-Control: no-store` on API responses: without it the HTTP cache may
 *    heuristically store them, and a later visitor on the same browser could be
 *    served the previous user's JSON.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The image optimizer is not used anywhere in this app (no `next/image`), and
  // Next 14's optimizer carries an unauthenticated RCE advisory (AVIF path)
  // whose only fix is Next 15. Rather than upgrade under time pressure, the
  // endpoint is closed: 404 for a route nothing requests. Delete this guard as
  // part of the Next 15 upgrade — and if `next/image` is ever adopted first,
  // delete it then.
  if (pathname.startsWith("/_next/image")) {
    return new NextResponse(null, { status: 404 });
  }

  const showLanding = flag(process.env.SHOW_LANDING, true);

  if (pathname === "/" && !showLanding) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const response = NextResponse.next();

  if (pathname.startsWith("/api/")) {
    response.headers.set("Cache-Control", "no-store");
  }

  if (!flag(process.env.SITE_INDEXABLE, showLanding)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export const config = {
  /**
   * Every route the app renders, plus the API — but not the build output or the
   * images the landing serves, which are files that no header of ours improves.
   * The API stays in the matcher for the `no-store` rule above.
   */
  matcher: [
    "/((?!_next/|landing-views/|landing-logos/|.*\\.(?:png|jpe?g|webp|svg|ico|webmanifest)$).*)",
  ],
};
