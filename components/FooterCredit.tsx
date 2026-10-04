"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Heart } from "lucide-react";

/**
 * The footer's credit line, fetched after hydration, and the build's version.
 *
 * The server used to render this from the deployment's identity, which was
 * correct while every page rendered per request. Now that pages are
 * prerendered, a server-rendered credit would be the *build* environment's
 * answer: a self-hosted instance would show the hosted studio's name in its
 * footer. So the deployment answers for itself — `/api/config/site` reads the
 * live environment — and this renders whichever answer arrives.
 *
 * The cost is that the line appears a moment after the page, at the very bottom
 * of it, next to links that are already there.
 *
 * The version comes from `package.json` at build time, which is exactly what it
 * identifies: the commit the running image was built from, and the first thing
 * worth asking for when somebody reports a bug. It is deliberately *not* on the
 * marketing landing, which still says the product is coming soon and is written
 * for people looking for work rather than for operators. Nothing here checks for
 * a newer release — an instance that phones home is not the instance this
 * project promises.
 */
export function FooterCredit({ version }: { version: string }) {
  const pathname = usePathname();
  const [identity, setIdentity] = useState<{
    operator: { name: string; url: string | null } | null;
    poweredByUrl: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/config/site", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setIdentity(data);
      })
      .catch(() => {
        // No credit line is better than a wrong one.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const linkClass = "transition-colors hover:text-foreground hover:underline";
  const showVersion = pathname !== "/";

  return (
    <p className="flex items-center gap-1">
      {identity?.operator ? (
        <>
          Made with
          <Heart className="h-3.5 w-3.5 fill-red-500 text-red-500" aria-hidden />
          by{" "}
          {identity.operator.url ? (
            <a
              href={identity.operator.url}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              {identity.operator.name}
            </a>
          ) : (
            <span>{identity.operator.name}</span>
          )}
        </>
      ) : identity ? (
        <>
          Self-hosted, powered by{" "}
          <a
            href={identity.poweredByUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            Ghosted
          </a>
        </>
      ) : (
        // Hold the line's height while the deployment answers, so the legal
        // links do not move when the credit arrives.
        <span className="min-h-[1rem]">&nbsp;</span>
      )}
      {showVersion && (
        <>
          <span aria-hidden className="px-0.5">
            ·
          </span>
          <span>v{version}</span>
        </>
      )}
    </p>
  );
}
