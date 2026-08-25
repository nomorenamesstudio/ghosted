import Link from "next/link";
import { Ghost } from "lucide-react";

/** The one true brand mark — used by every header. */
export function AppBrand() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <Ghost className="h-5 w-5 text-violet-500" aria-hidden />
      <span className="font-semibold tracking-tight">Ghosted</span>
    </Link>
  );
}
