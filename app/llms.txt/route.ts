import { REPO_URL, siteOrigin } from "@/lib/site";

/**
 * `llms.txt` — the short, plain-text map of this site for answer engines.
 *
 * Rendered per request rather than shipped from `public/`: the addresses here are
 * this deployment's own, and a static file would hand a self-hoster a map that
 * points at the hosted instance. Nothing here is instance-specific beyond the
 * origin, so it costs one string build.
 */
export function GET() {
  const origin = siteOrigin();

  const body = `# Ghosted

> A free, open-source job tracker that keeps every application and interview on one timeline, with its own section for the ones that stopped answering. No AI in the product, no data harvesting, MIT licensed.

## Core pages

- [Live app](${origin}): Use it in the browser — email, or Google and LinkedIn
- [Why Ghosted exists](${origin}/#why-ghosted-exists): The origin story, and what it replaces
- [Common questions](${origin}/#faq): Free or not, self-hosting, AI, data export
- [Repository](${REPO_URL}): Source code, issues, self-hosting instructions
- [Self-hosting guide](${REPO_URL}/blob/main/docs/SELFHOST.md): Docker Compose, environment, upgrades
- [License](${REPO_URL}/blob/main/LICENSE): MIT
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
