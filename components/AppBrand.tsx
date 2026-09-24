import Link from "next/link";
import { Ghost } from "lucide-react";

/** The one true brand mark — used by every header. */
export function AppBrand() {
  return (
    <Link href="/app" className="flex items-center gap-2">
      {/* Optically centred on the wordmark, not box-centred: `items-center`
          centres the icon's box on the text's line box, and a line box reserves
          descender room that "Ghosted" never uses — so the ghost sat 0.75px low
          against the letters (measured from the rendered pixels). The nudge is
          the glyph metrics, not a taste call. */}
      <Ghost className="h-5 w-5 -translate-y-px text-violet-500" aria-hidden />
      <span className="font-semibold tracking-tight">
        Ghosted
        <sup className="ml-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">
          β
        </sup>
      </span>
    </Link>
  );
}
