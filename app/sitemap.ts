import type { MetadataRoute } from "next";
import { siteIdentity, siteOrigin } from "@/lib/site";

/**
 * Per request, for the same reason `robots.ts` is: this reads the environment,
 * and Next would otherwise freeze the build environment's answer into a file
 * that a published image then serves to every instance.
 */
export const dynamic = "force-dynamic";

/**
 * The pages worth indexing. The landing is the product page; the legal pages
 * are indexable because they are public and stable. Nothing behind the session
 * appears here, and neither does `/login` or `/register` — a crawler that lands
 * there learns nothing it cannot learn from the landing.
 *
 * A private instance advertises nothing at all: an empty sitemap is the honest
 * answer when every page carries `noindex`.
 */
export function sitemapEntries(
  indexable: boolean,
  origin: string,
): MetadataRoute.Sitemap {
  if (!indexable) return [];

  const lastModified = new Date();
  return ["/", "/privacy", "/terms", "/imprint"].map((path) => ({
    url: `${origin}${path === "/" ? "/" : path}`,
    lastModified,
    changeFrequency: path === "/" ? ("weekly" as const) : ("yearly" as const),
    priority: path === "/" ? 1 : 0.3,
  }));
}

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries(siteIdentity().indexable, siteOrigin());
}
