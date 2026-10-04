import type { MetadataRoute } from "next";
import { siteIdentity, siteOrigin } from "@/lib/site";

/**
 * Rendered per request, for the same reason the root layout is: this reads the
 * environment, and Next would otherwise generate the file once at build time —
 * with the *build* environment's answer, which for a published image is the
 * hosted defaults. A self-hosted instance would then serve an allowing
 * robots.txt beside noindex pages, which is the contradiction the privacy
 * default exists to avoid.
 */
export const dynamic = "force-dynamic";

/**
 * Only the operator's own instance should be crawlable. A self-hosted one is
 * private by default — someone's job hunt on a random domain is not something
 * to put in an index — and `SITE_INDEXABLE=true` is the opt-in for a hoster who
 * does want their instance found.
 *
 * The API and the two image proxies are excluded even when indexing is on:
 * they are per-user and either private or cacheable-but-pointless in a search
 * result.
 */
export default function robots(): MetadataRoute.Robots {
  const identity = siteIdentity();

  if (!identity.indexable) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/logos/", "/avatars/"] },
    ],
    // Pointing at the sitemap only when there is one: a private instance returns
    // an empty list above, and telling a crawler to fetch an empty file is worse
    // than saying nothing.
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
