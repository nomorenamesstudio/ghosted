import Link from "next/link";

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
 * `href` defaults to the app because that is where the mark leads once you are
 * signed in; the landing passes "/" so it stays on the public page.
 */
export function AppBrand({ href = "/app" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center">
      <span className="text-lg font-semibold tracking-tight">
        {/* Spelled out, and in Geist Mono: a single β glyph at 10px read as a
            stray character rather than a label, and the mono face gives the word
            a different texture from the wordmark at the same size. The space is
            real so the accessible name is "Ghosted beta", not "Ghostedbeta". */}
        Ghosted{" "}
        <sup className="font-mono text-[10px] font-medium tracking-wide text-violet-700 dark:text-violet-300">
          beta
        </sup>
      </span>
    </Link>
  );
}
