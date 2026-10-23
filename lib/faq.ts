import { DONATE_URL } from "@/lib/utils/donate-banner";

/**
 * The landing's FAQ, as text — one source for the page and for the `FAQPage`
 * structured data.
 *
 * The answers used to live in JSX, with links and three-paragraph stories. Two
 * things were wrong with that: a crawler could not match the visible answer to
 * the schema (the schema was never emitted at all), and answer engines extract
 * the first sentence of a block, which was never the answer. So each answer now
 * opens with the answer and stays inside 40–60 words. An answer may carry one
 * link; it is declared beside the text (`link`) rather than written into it, so the
 * sentence the page renders and the sentence the schema emits stay the same words.
 *
 * `lib/structured-data.ts` emits this array verbatim, so an edit here changes the
 * page and the schema together, which is the only way they stay matched.
 */
export interface FaqEntry {
  q: string;
  /** The answer as plain text: this is what the page renders and what the
   *  `FAQPage` schema repeats. */
  a: string;
  /** One link inside the answer, matched by its label in `a`. */
  link?: { label: string; href: string };
}

export const LANDING_FAQ: FaqEntry[] = [
  {
    q: "Is Ghosted really free?",
    a: "Yes. There is no paid tier, no ads, and nothing about your hunt is sold. Job hunting already costs money and time, so charging rent on the logbook never made sense. If you feel like it you can buy me a coffee, and skipping it changes nothing.",
    link: { label: "buy me a coffee", href: DONATE_URL },
  },
  {
    q: "Why is there no AI in Ghosted?",
    a: "Ghosted writes nothing for you, applies to nothing for you and reads no mailbox. It knows only what you type into it. The app was built with AI assistance and says so openly, but the product ships with no model, no API key and no token bill.",
  },
  {
    q: "How does Ghosted decide an application went quiet?",
    a: "An application that has not moved for ten days leaves its stage and joins the ghosted ones. Ten is the default and you set your own pace per account. It is a nudge, not a verdict: anything you have touched recently stays where it is.",
  },
  {
    q: "Can I self-host Ghosted?",
    a: "Yes. One container and a Postgres, migrations on start, everything else in environment variables. No prebuilt image ships on purpose — the app bakes your domain into its pages at build time — so you build it yourself with Docker Compose, or use the hosted instance at ghosted.boo.",
  },
  {
    q: "Can I take my data with me?",
    a: "Yes. Export every application, milestone and note as JSON whenever you like, and import a file into an existing account. Deleting the account deletes the data with it. A tracker you cannot leave is not one you can trust.",
  },
  {
    q: "Who built Ghosted?",
    // No company name here: this page is prerendered, so the operator's own name
    // would be baked into every self-hosted instance that pulls the image. The
    // footer resolves the operator at runtime; the FAQ talks about the software.
    a: "K. Ghosted is a one-person project, built during my own job hunt in 2026 — the first real application was logged on 3 September, and it ghosted me too. Hand-written and AI-enhanced, MIT licensed, and the whole source is on GitHub.",
  },
  {
    q: "What's the catch?",
    a: "There is none. No funding, no scaling, no exit strategy, no data harvesting. Ghosted is a logbook for your hunt and it stays that size on purpose. If you would rather trust nobody's server, self-host it; that is the whole business model.",
  },
];
