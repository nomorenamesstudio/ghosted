import packageJson from "@/package.json";
import { LANDING_FAQ } from "@/lib/faq";
import { LICENSE_URL, REPO_URL, siteOrigin } from "@/lib/site";

/**
 * What a search engine and an answer engine are told about this page.
 *
 * Deliberately narrow: name, category, platform, description, origin, version,
 * the licence of the code, and the price. Everything here is a fact this
 * repository can back up — no rating, no review count. `offers` is the owner's
 * own claim, made on the page itself ("free forever", and the first FAQ answer),
 * so the schema repeats visible copy instead of adding a claim beside it.
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
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    // No `publisher`: this block is rendered into a prerendered page, so naming
    // the operator here would bake the build's answer into every instance that
    // pulls the image. The origin is build-time by design (like the canonical
    // URL), but a company name is not a property of the software.
  };
}

/**
 * The FAQ block, emitted from the same array the page renders.
 *
 * Google dropped the FAQ rich result for most sites, and this is not about the
 * snippet: an answer engine that reads the page gets the questions and answers as
 * one structured pair instead of guessing where an answer ends. It costs one
 * script tag and cannot drift from the copy, because there is only one copy.
 */
export function faqJsonLd(faq: { q: string; a: string }[] = LANDING_FAQ) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}
