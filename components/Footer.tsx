import Link from "next/link";
import { Heart } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="app-shell mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-6 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
        <p className="flex items-center gap-1">
          Made with
          <Heart className="h-3.5 w-3.5 fill-red-500 text-red-500" aria-hidden />
          by Lost Signals Studio
        </p>
        <nav aria-label="Legal" className="flex gap-4">
          <Link href="/privacy" className="transition-colors hover:text-foreground hover:underline">
            Privacy Policy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-foreground hover:underline">
            Terms of Service
          </Link>
          <Link href="/imprint" className="transition-colors hover:text-foreground hover:underline">
            Imprint
          </Link>
        </nav>
      </div>
    </footer>
  );
}
