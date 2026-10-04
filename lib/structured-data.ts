import packageJson from "@/package.json";
import { LICENSE_URL, REPO_URL, siteOrigin } from "@/lib/site";

/**
 * What a search engine and an answer engine are told about this page.
 *
 * Deliberately narrow: name, category, platform, description, origin, version,
 * the licence of the code, and who publishes it. Everything here is a fact this
 * repository can back up — no rating, no price, no review count, no "free" claim
 * the owner has not made. Structured data that overstates is a penalty risk, and
 * the parts above are the parts that actually earn a rich result.
 *
 * Deliberately says nothing about who runs the instance: see the note on
 * `publisher` below.
 */
export function softwareApplicationJsonLd(
  env: Record<string, string | undefined> = process.env,
) {
  const origin = siteOrigin(env);

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Ghosted",
    url: origin,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    softwareVersion: packageJson.version,
    license: LICENSE_URL,
    codeRepository: REPO_URL,
    description:
      "Track your job applications and interview progress — and never lose track of the ones that went quiet.",
    featureList: [
      "Applications as cards, grouped by stage",
      "Interview milestones per application",
      "A quiet-since signal for applications that stopped replying",
      "Self-hosted, with a JSON export of your own data",
    ],
    // No `publisher`: this block is rendered into a prerendered page, so naming
    // the operator here would bake the build's answer into every instance that
    // pulls the image. The origin is build-time by design (like the canonical
    // URL), but a company name is not a property of the software.
  };
}
