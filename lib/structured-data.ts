import { version } from "@/package.json";
import { LICENSE_URL, REPO_URL, siteIdentity, siteOrigin } from "@/lib/site";

/**
 * What a search engine and an answer engine are told about this page.
 *
 * Deliberately narrow: name, category, platform, description, origin, version,
 * the licence of the code, and who publishes it. Everything here is a fact this
 * repository can back up — no rating, no price, no review count, no "free" claim
 * the owner has not made. Structured data that overstates is a penalty risk, and
 * the parts above are the parts that actually earn a rich result.
 *
 * The publisher is the operator from the instance's own identity, so a
 * self-hosted copy advertises its own operator rather than the hosted studio.
 */
export function softwareApplicationJsonLd(
  env: Record<string, string | undefined> = process.env,
) {
  const identity = siteIdentity();
  const origin = siteOrigin(env);

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Ghosted",
    url: origin,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    softwareVersion: version,
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
    ...(identity.operator
      ? {
          publisher: {
            "@type": "Organization",
            name: identity.operator.name,
            ...(identity.operator.legalName
              ? { legalName: identity.operator.legalName }
              : {}),
            ...(identity.operator.url ? { url: identity.operator.url } : {}),
          },
        }
      : {}),
  };
}
