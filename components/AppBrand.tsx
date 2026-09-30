import Link from "next/link";
import { siteIdentity } from "@/lib/site";

/**
 * The one true brand mark — every header renders this, the landing page's
 * included, which used to carry its own copy of the same markup.
 *
 * Text only: the ghost glyph that used to sit beside the wordmark came out on
 * 2026-09-24, and the wordmark took the size and the room it left behind. The
 * character still carries the app icon and the social card, so nothing is lost
 * from the identity — the header just stops repeating it three inches from a
 * hero illustration of the same ghost.
 *
 * The superscript is `BRAND_TAG` (see lib/site.ts): empty on the hosted
 * instance — the "beta" it used to say is gone — and `DIY` by default on a
 * self-hosted one, overridable to any word or to "none".
 *
 * `href` defaults to the app because that is where the mark leads once you are
 * signed in; the landing passes "/" so it stays on the public page. Pass `null`
 * on an instance with no landing page: a wordmark that leads to the page you are
 * already on is worse than one that leads nowhere.
 */
export function AppBrand({ href = "/app" }: { href?: string | null }) {
  const { brandTag } = siteIdentity();

  const label = (
    <span className="text-lg font-semibold tracking-tight">
      Ghosted
      {brandTag && (
        <>
          {" "}
          {/* Spelled out, and in Geist Mono: a single glyph at 10px read as a
              stray character rather than a label, and the mono face gives the
              word a different texture from the wordmark at the same size. The
              space is real so the accessible name is "Ghosted DIY", not
              "GhostedDIY". */}
          <sup className="font-mono text-[10px] font-medium tracking-wide text-violet-700 dark:text-violet-300">
            {brandTag}
          </sup>
        </>
      )}
    </span>
  );

  if (!href) return <span className="flex items-center">{label}</span>;

  return (
    <Link href={href} className="flex items-center">
      {label}
    </Link>
  );
}
