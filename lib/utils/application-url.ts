/**
 * A stable identity for a posting URL.
 *
 * The same job arrives as `https://boards.greenhouse.io/acme/jobs/123`,
 * `http://www.boards.greenhouse.io/acme/jobs/123/` and
 * `https://boards.greenhouse.io/acme/jobs/123?utm_source=linkedin&gh_src=xyz` —
 * three strings, one application. An automation that runs a mailbox digest daily
 * must recognise the second day's copy, so the key keeps what identifies the
 * posting (host without `www.`, path without its trailing slash, and the query
 * parameters that are part of the posting) and drops what only says where the
 * click came from. The scheme and the fragment are noise.
 *
 * `null` means there is no usable URL, and the caller falls back to company +
 * role — which is the weaker identity, and the reason a URL is worth passing.
 */

/** Query parameters that track the click, never the posting. */
const TRACKING_PARAMS = new Set([
  "gclid",
  "fbclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "mkt_tok",
  "gh_src",
  "ref",
  "referrer",
  "referral",
  "source",
  "src",
  "trk",
  "trackingid",
  "_hsenc",
  "_hsmi",
]);

const TRACKING_PREFIXES = ["utm_"];

function isTracking(name: string): boolean {
  const key = name.toLowerCase();
  return (
    TRACKING_PARAMS.has(key) ||
    TRACKING_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

export function urlMatchKey(url: string | null | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;

  // A bare `boards.greenhouse.io/acme/jobs/123` is a URL a user or an agent may
  // well send; parsing it as https keeps it comparable to the full form.
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    // Not a URL we can take apart: compare it as typed, lowercased, so the same
    // string still matches itself rather than matching nothing.
    return raw.toLowerCase();
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return raw.toLowerCase();
  }

  const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
  const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
  const query = [...parsed.searchParams.entries()]
    .filter(([name]) => !isTracking(name))
    .map(([name, value]) => `${name.toLowerCase()}=${value}`)
    .sort()
    .join("&");

  return `${host}${path}${query ? `?${query}` : ""}`;
}
