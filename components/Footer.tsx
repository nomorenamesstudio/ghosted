import Link from "next/link";
import { FooterCredit } from "./FooterCredit";

/**
 * The footer shell: the legal links, plus a credit line the deployment answers
 * for at runtime (see FooterCredit — it must not be baked into a build).
 */
export function Footer() {
  const linkClass =
    "transition-colors hover:text-foreground hover:underline";

  return (
    <footer className="border-t bg-muted/30">
      <div className="app-shell mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-6 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
        <FooterCredit />
        <nav aria-label="Legal" className="flex gap-4">
          <Link href="/privacy" className={linkClass}>
            Privacy Policy
          </Link>
          <Link href="/terms" className={linkClass}>
            Terms of Service
          </Link>
          <Link href="/imprint" className={linkClass}>
            Imprint
          </Link>
        </nav>
      </div>
    </footer>
  );
}
