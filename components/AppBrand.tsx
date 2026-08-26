import Link from "next/link";
import { Ghost } from "lucide-react";

/** The one true brand mark — used by every header. */
export function AppBrand() {
  return (
    <Link href="/app" className="flex items-center gap-2">
      <Ghost className="h-5 w-5 text-violet-500" aria-hidden />
      <span className="font-semibold tracking-tight">
        Ghosted
        <sup className="ml-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">
          beta
        </sup>
      </span>
    </Link>
  );
}
