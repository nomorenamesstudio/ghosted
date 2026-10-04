"use client";

import { useEffect } from "react";

/**
 * The analytics tag, attached after hydration.
 *
 * It used to be rendered by the root layout from `UMAMI_SRC` / `UMAMI_WEBSITE_ID`,
 * which was fine while that layout rendered per request. Now that the layout
 * wraps prerendered pages, a tracker baked into the HTML would travel with the
 * image: one published image would carry the hosted instance's tracker into
 * every self-hosted copy that pulled it, reporting their visitors to a third
 * party they never configured. So the page ships without a tracker, and the
 * deployment's own answer decides — `/api/config/analytics` reads the live
 * environment, and a deployment that configured nothing gets a 204 and no
 * script at all.
 *
 * The cost is one small same-origin request after hydration, and analytics that
 * start a moment later than the page. Nothing on the page waits for either.
 */
export function Analytics() {
  useEffect(() => {
    let cancelled = false;

    fetch("/api/config/analytics", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((config: { src?: string; websiteId?: string; domains?: string } | null) => {
        if (cancelled || !config?.src || !config?.websiteId) return;
        const script = document.createElement("script");
        script.src = config.src;
        script.defer = true;
        script.dataset.websiteId = config.websiteId;
        if (config.domains) script.dataset.domains = config.domains;
        document.body.appendChild(script);
      })
      .catch(() => {
        // A tracker that fails to load is not a page failure.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
