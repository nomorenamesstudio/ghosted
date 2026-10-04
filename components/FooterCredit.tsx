"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";

/**
 * The footer's credit line, fetched after hydration.
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
 */
export function FooterCredit() {
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

  if (!identity) return <p className="min-h-[1rem]">&nbsp;</p>;

  if (identity.operator) {
    return (
      <p className="flex items-center gap-1">
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
      </p>
    );
  }

  return (
    <p className="flex items-center gap-1">
      Self-hosted, powered by{" "}
      <a
        href={identity.poweredByUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        Ghosted
      </a>
    </p>
  );
}
