/**
 * Which domains to try when looking up a company logo.
 *
 * The only URL we store is the *job posting* URL, and job seekers usually paste
 * a board link (`linkedin.com/jobs/...`, `boards.greenhouse.io/acme/...`) rather
 * than the employer's own site. A favicon taken from a board link is the board's
 * logo, so those hosts are recognised and stripped before anything is fetched.
 *
 * Pure and synchronous on purpose: candidate selection never touches the
 * network, so the caller can cache the outcome per domain.
 */

/** Job boards / ATS hosts - a favicon from one of these belongs to the board. */
const JOB_BOARD_HOSTS = [
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "ziprecruiter.com",
  "monster.com",
  "dice.com",
  "builtin.com",
  "wellfound.com",
  "angel.co",
  "otta.com",
  "himalayas.app",
  "remoteok.com",
  "weworkremotely.com",
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "workable.com",
  "recruitee.com",
  "bamboohr.com",
  "teamtailor.com",
  "personio.com",
  "jobvite.com",
  "smartrecruiters.com",
  "icims.com",
  "taleo.net",
  "successfactors.com",
  "myworkdayjobs.com",
  "workday.com",
  "jobs.lever.co",
];

/** Path segments that are never an employer slug. */
const PATH_STOPWORDS = new Set([
  "jobs",
  "job",
  "view",
  "careers",
  "career",
  "positions",
  "position",
  "apply",
  "application",
  "applications",
  "company",
  "companies",
  "posting",
  "postings",
  "listing",
  "listings",
  "openings",
  "opening",
  "board",
  "boards",
  "embed",
  "share",
  "search",
  "en",
  "www",
]);

/**
 * TLDs that can never resolve to a real company (RFC 2606/6761 reserved, plus
 * the usual private-network suffixes). Skipping them saves a guaranteed-empty
 * probe - seed/fixture data loves `.example`.
 */
const DEAD_TLDS = new Set([
  "example",
  "test",
  "invalid",
  "localhost",
  "local",
  "internal",
  "home",
  "lan",
]);

const HOST_RE =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Candidate domains tried in order, most trustworthy first. */
const MAX_CANDIDATES = 5;

function isJobBoardHost(host: string): boolean {
  return JOB_BOARD_HOSTS.some(
    (board) => host === board || host.endsWith(`.${board}`),
  );
}

function hasDeadTld(host: string): boolean {
  const tld = host.slice(host.lastIndexOf(".") + 1);
  return DEAD_TLDS.has(tld);
}

/**
 * Normalise a URL or bare host to a lowercase domain, or null when the input
 * cannot be one. Deliberately rejects IP literals: nothing here should ever be
 * able to point a fetch at an internal address.
 */
export function normaliseDomain(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  const raw = input.trim().toLowerCase();
  if (!raw) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(raw)
    ? raw
    : `https://${raw}`;

  let host: string;
  try {
    host = new URL(withScheme).hostname;
  } catch {
    return null;
  }

  host = host.replace(/\.$/, "").replace(/^www\./, "");
  if (!host || host.length > 253) return null;
  if (host.includes(":") || IPV4_RE.test(host)) return null;
  if (!HOST_RE.test(host)) return null;
  if (!host.includes(".")) return null;

  return host;
}

/**
 * A company name as a domain label - only for names that are a single
 * alphabetic word. Multi-word and digit-bearing names ("Acme Corp", "Stress Co
 * 042") almost never live at their concatenated domain, and guessing there is
 * how you end up showing the wrong company's logo.
 */
export function companySlug(name: string): string | null {
  const slug = name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  // Single alphabetic word only - the check has to happen before punctuation
  // is dropped, or "Acme Corp" would quietly become the plausible-looking
  // "acmecorp".
  if (!/^[a-z]+$/.test(slug)) return null;
  if (slug.length < 2 || slug.length > 63) return null;

  return slug;
}

/** `careers.stripe.com` -> `stripe.com`; leaves two-label hosts alone. */
function parentDomain(host: string): string | null {
  const labels = host.split(".");
  if (labels.length <= 2) return null;
  const parent = labels.slice(-2).join(".");
  return parent === host ? null : parent;
}

/** `acme.greenhouse.io` -> `acme`; null when the host carries no company. */
function boardSubdomain(host: string): string | null {
  const board = JOB_BOARD_HOSTS.find(
    (candidate) => host !== candidate && host.endsWith(`.${candidate}`),
  );
  if (!board) return null;
  const prefix = host.slice(0, -(board.length + 1));
  const labels = prefix.split(".");
  const slug = labels[labels.length - 1];
  return /^[a-z0-9-]{2,63}$/.test(slug) && !PATH_STOPWORDS.has(slug)
    ? slug
    : null;
}

/** First meaningful path segment - `boards.greenhouse.io/acme/123` -> `acme`. */
function boardPathSlug(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const { pathname } = new URL(rawUrl.trim());
    for (const segment of pathname.split("/")) {
      const slug = segment.trim().toLowerCase();
      if (!slug) continue;
      if (/^\d+$/.test(slug)) return null;
      if (PATH_STOPWORDS.has(slug)) continue;
      if (!/^[a-z0-9-]{2,63}$/.test(slug)) return null;
      return slug;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Ordered list of domains worth probing for a company logo. An explicit company
 * website always wins - it is the only entry the user actually stated, and it
 * is the fix for a job board link or an ambiguous company name. Empty when
 * nothing plausible can be derived - the caller then falls back to a monogram.
 */
export function logoDomainCandidates(
  company: string,
  url: string | null | undefined,
  companyWebsite?: string | null,
): string[] {
  const candidates: string[] = [];
  const push = (value: string | null) => {
    if (!value) return;
    if (candidates.includes(value)) return;
    candidates.push(value);
  };

  // The employer's own site, when the user told us what it is.
  const stated = normaliseDomain(companyWebsite);
  if (stated && !hasDeadTld(stated)) push(stated);

  const host = normaliseDomain(url);
  const onBoard = host ? isJobBoardHost(host) : false;

  if (host && !onBoard && !hasDeadTld(host)) push(host);
  if (host && !onBoard) {
    const parent = parentDomain(host);
    if (parent && !hasDeadTld(parent)) push(parent);
  }

  // Board links: the employer slug is in the subdomain or the first path
  // segment, and the employer domain is then its own `.com`.
  const slugFromBoard = (host && onBoard ? boardSubdomain(host) : null) ?? null;
  const slugFromPath = onBoard || !host ? boardPathSlug(url) : null;
  const boardSlug = slugFromBoard ?? slugFromPath;
  if (boardSlug) {
    push(`${boardSlug}.com`);
    push(`${boardSlug}.io`);
  }

  // Last resort: a single-word company name as its own domain.
  const slug = companySlug(company);
  if (slug) {
    push(`${slug}.com`);
    push(`${slug}.io`);
    push(`${slug}.co`);
  }

  return candidates.filter(hasRealTld).slice(0, MAX_CANDIDATES);
}

function hasRealTld(host: string): boolean {
  if (!HOST_RE.test(host)) return false;
  if (hasDeadTld(host)) return false;
  return true;
}
