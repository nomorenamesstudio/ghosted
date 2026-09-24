import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { companyLogos } from "@/lib/db/schema";
import { logoDomainCandidates } from "@/lib/utils/company-domain";
import { logger } from "@/lib/utils/logger";

/**
 * Company logo cache-aside: look the domain up in `company_logos`, fetch from a
 * favicon service only on a miss, store the result (including the miss) and
 * serve the bytes from our own origin.
 *
 * Why proxy instead of hotlinking the favicon service in an `<img>`: the
 * response is cached for a year per user, the user's employer list is not sent
 * to a third party on every render, and a logo that disappears upstream keeps
 * working. Why the DB instead of object storage: favicons are 1-15KB, and a
 * Postgres column adds no second dependency to the render path (see
 * docs/ARCHITECTURE.md - the swap point is this module).
 */

export interface CompanyLogo {
  bytes: Buffer;
  contentType: string;
}

const UPSTREAM_SOURCES = ["google", "duckduckgo"] as const;
type UpstreamSource = (typeof UPSTREAM_SOURCES)[number];

/** Re-check a found logo after this long - favicons change rarely. */
const OK_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** Retry a cached miss sooner - a company may add a favicon any time. */
const NONE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const MAX_BYTES = 64 * 1024;
const FETCH_TIMEOUT_MS = 5_000;

/** Cap in-flight upstream fetches so a full dashboard page cannot stampede. */
const MAX_UPSTREAM_CONCURRENCY = 5;

/**
 * Content types we are willing to store and re-serve from our own origin.
 * SVG is deliberately absent: serving third-party SVG same-origin is a
 * script-execution path, and no favicon service returns it anyway.
 */
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "image/png",
  "image/x-icon": "image/x-icon",
  "image/vnd.microsoft.icon": "image/vnd.microsoft.icon",
  "image/jpeg": "image/jpeg",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

/**
 * Decide whether an upstream response is a usable logo, returning the content
 * type to store with it.
 *
 * The status code is the signal, not the body: Google answers 404 *with* a
 * 726-byte default globe, and DuckDuckGo answers 200 with a zero-byte
 * `text/plain` body for a domain that simply has no icon. Both must be treated
 * as "no logo", so the size and type checks are not optional.
 */
export function acceptUpstream(
  status: number,
  contentType: string | null,
  byteLength: number,
): string | null {
  if (status !== 200) return null;
  if (byteLength <= 0 || byteLength > MAX_BYTES) return null;
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return ALLOWED_TYPES[type] ?? null;
}

function upstreamUrl(source: UpstreamSource, domain: string): string {
  return source === "google"
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`
    : `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
}

async function fetchFrom(
  source: UpstreamSource,
  domain: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(upstreamUrl(source, domain), {
      // Only ever our two fixed favicon hosts, so a user-supplied URL can
      // never steer this request (no SSRF surface).
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": "Ghosted/0.1 (company logo lookup)" },
    });
    const bytes = Buffer.from(await res.arrayBuffer());
    const contentType = acceptUpstream(
      res.status,
      res.headers.get("content-type"),
      bytes.length,
    );
    if (!contentType) return null;
    return { bytes, contentType };
  } catch (err) {
    logger.warn({ err, domain, source }, "company logo fetch failed");
    return null;
  }
}

async function fetchLogo(domain: string): Promise<{
  bytes: Buffer;
  contentType: string;
  source: UpstreamSource;
} | null> {
  for (const source of UPSTREAM_SOURCES) {
    const found = await withUpstreamSlot(() => fetchFrom(source, domain));
    if (found) return { ...found, source };
  }
  return null;
}

let active = 0;
const waiting: Array<() => void> = [];

/** Minimal in-process semaphore - same single-process reasoning as rate-limit. */
async function withUpstreamSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_UPSTREAM_CONCURRENCY) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else {
    active++;
  }
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

async function store(
  domain: string,
  fetched: {
    bytes: Buffer;
    contentType: string;
    source: UpstreamSource;
  } | null,
): Promise<void> {
  const now = new Date();
  await db
    .insert(companyLogos)
    .values({
      domain,
      status: fetched ? "ok" : "none",
      source: fetched?.source ?? null,
      contentType: fetched?.contentType ?? null,
      bytesBase64: fetched ? fetched.bytes.toString("base64") : null,
      byteSize: fetched?.bytes.length ?? null,
      fetchedAt: now,
    })
    .onConflictDoUpdate({
      target: companyLogos.domain,
      set: {
        status: fetched ? "ok" : "none",
        source: fetched?.source ?? null,
        contentType: fetched?.contentType ?? null,
        bytesBase64: fetched ? fetched.bytes.toString("base64") : null,
        byteSize: fetched?.bytes.length ?? null,
        fetchedAt: now,
        attempts: sql`${companyLogos.attempts} + 1`,
      },
    });
}

function isFresh(fetchedAt: Date, status: "ok" | "none"): boolean {
  const ttl = status === "ok" ? OK_TTL_MS : NONE_TTL_MS;
  return Date.now() - fetchedAt.getTime() < ttl;
}

/**
 * Is there nothing for `/logos/:id` to answer with? True when the company has no
 * candidate domain at all, or when every candidate is already cached as "no
 * logo" — in both cases the route can only reply 404, so a caller holding this
 * answer should render the monogram instead of asking. Anything merely uncached
 * returns false: the route would go and fetch it.
 *
 * Pure, so a caller with many applications can ask once for all of them (the
 * list does) and a caller with one can use the async form below.
 */
export function logoMissingFrom(
  domains: string[],
  knownMissing: ReadonlySet<string>,
): boolean {
  return domains.length === 0 || domains.every((d) => knownMissing.has(d));
}

/** The single-application form of `logoMissingFrom`. */
export async function logoIsKnownMissing(
  company: string,
  url: string | null | undefined,
  companyWebsite?: string | null,
): Promise<boolean> {
  const domains = logoDomainCandidates(company, url, companyWebsite);
  if (domains.length === 0) return true;

  const rows = await db
    .select({ domain: companyLogos.domain })
    .from(companyLogos)
    .where(
      and(
        inArray(companyLogos.domain, domains),
        eq(companyLogos.status, "none"),
      ),
    );
  return logoMissingFrom(domains, new Set(rows.map((row) => row.domain)));
}

/**
 * Resolve the logo for a company, fetching and caching on a miss. Returns null
 * when no candidate domain produced an icon - the caller renders a monogram.
 */
export async function resolveCompanyLogo(
  company: string,
  url: string | null | undefined,
  companyWebsite?: string | null,
): Promise<CompanyLogo | null> {
  const candidates = logoDomainCandidates(company, url, companyWebsite);
  if (candidates.length === 0) return null;

  const rows = await db
    .select()
    .from(companyLogos)
    .where(inArray(companyLogos.domain, candidates));
  const cached = new Map(rows.map((row) => [row.domain, row]));

  for (const domain of candidates) {
    const row = cached.get(domain);
    if (row && isFresh(row.fetchedAt, row.status)) {
      if (row.status === "ok" && row.bytesBase64 && row.contentType) {
        return {
          bytes: Buffer.from(row.bytesBase64, "base64"),
          contentType: row.contentType,
        };
      }
      continue;
    }

    const fetched = await fetchLogo(domain);
    await store(domain, fetched);
    if (fetched) {
      return { bytes: fetched.bytes, contentType: fetched.contentType };
    }
  }

  return null;
}
