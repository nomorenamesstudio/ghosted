import Link from "next/link";
import { Heart } from "lucide-react";
import { siteIdentity } from "@/lib/site";

/**
 * The credit line, and the one place a self-hosted instance would otherwise
 * wear somebody else's name: with no `OPERATOR_NAME` set, the footer says
 * "powered by Ghosted" and links to the repo instead of crediting the studio
 * that wrote the software.
 */
export function Footer() {
  const { operator, poweredByUrl } = siteIdentity();
  const linkClass =
    "transition-colors hover:text-foreground hover:underline";

  return (
    <footer className="border-t bg-muted/30">
      <div className="app-shell mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-6 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
        {operator ? (
          <p className="flex items-center gap-1">
            Made with
            <Heart className="h-3.5 w-3.5 fill-red-500 text-red-500" aria-hidden />
            by{" "}
            {operator.url ? (
              <a
                href={operator.url}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                {operator.name}
              </a>
            ) : (
              <span>{operator.name}</span>
            )}
          </p>
        ) : (
          <p className="flex items-center gap-1">
            Self-hosted, powered by{" "}
            <a
              href={poweredByUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              Ghosted
            </a>
          </p>
        )}
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
