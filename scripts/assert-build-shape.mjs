/**
 * Assert how the build rendered, before the image is allowed to exist.
 *
 * This runs inside `docker build`, right after `next build`, because the bug it
 * guards against has now happened twice: a page that reads the deployment's
 * environment gets prerendered, and the build environment's answer is then baked
 * into an image that ships to instances it does not describe. The first time it
 * was `robots.txt` (a self-hosted instance serving the hosted instance's crawl
 * rules); the second time it was the legal pages (a self-hosted instance
 * publishing a privacy policy naming somebody else as the data controller), and
 * that second one also failed the build outright.
 *
 * Both directions are checked, because either is a bug:
 *
 * - prerendered *because it should be* — the landing, which is the page search
 *   engines read and the reason the static/prerender work exists at all;
 * - NOT prerendered *because it reads the environment* — `robots.txt`,
 *   `sitemap.xml`, and the three legal pages, which names the operator.
 *
 * Reading the manifest rather than grepping the build log: the log's table is
 * for humans and its format is Next's to change.
 */
import { existsSync, readFileSync } from "node:fs";

const MANIFEST = ".next/prerender-manifest.json";

const mustBeStatic = [
  ["/", "the landing is the page crawlers read"],
];

const mustBeDynamic = [
  ["/robots.txt", "it reads SITE_INDEXABLE per request"],
  ["/sitemap.xml", "it lists this instance's own URLs"],
  ["/imprint", "it names the operator"],
  ["/privacy", "it names the data controller"],
  ["/terms", "it names the operator"],
];

if (!existsSync(MANIFEST)) {
  console.error(
    `assert-build-shape: ${MANIFEST} is missing — run this after \`next build\`.`,
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const routes = new Set(Object.keys(manifest.routes ?? {}));

if (routes.size === 0) {
  console.error(
    "assert-build-shape: the manifest lists no prerendered routes at all, which is not the shape this app builds in.",
  );
  process.exit(1);
}

const problems = [];
for (const [route, why] of mustBeStatic) {
  if (!routes.has(route)) {
    problems.push(`${route} is not prerendered: ${why}`);
  }
}
for (const [route, why] of mustBeDynamic) {
  if (routes.has(route)) {
    problems.push(
      `${route} was prerendered at build time, but ${why} — the build's answer would ship to every instance that pulls this image`,
    );
  }
}

if (problems.length > 0) {
  console.error("assert-build-shape: refusing this build:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `assert-build-shape: ok — ${routes.has("/") ? "/" : "?"} prerendered, ` +
    `${mustBeDynamic.length} environment-dependent routes per request ` +
    `(${routes.size} prerendered routes in total)`,
);
