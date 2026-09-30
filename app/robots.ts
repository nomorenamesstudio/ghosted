import type { MetadataRoute } from "next";
import { siteIdentity } from "@/lib/site";

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
  };
}
