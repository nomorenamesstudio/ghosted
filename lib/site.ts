import {
  readBooleanFlag,
  runtimeConfig,
  type RuntimeConfig,
} from "@/lib/config/flags";

/**
 * Who runs *this* instance, and where the software came from.
 *
 * The distinction the rest of the app cares about: the hosted instance is
 * operated by No More Names Studio, a self-hosted one is operated by whoever
 * runs it — and when that person has not said who they are, the app must not
 * put someone else's company in their footer or their privacy policy. So the
 * defaults follow the deployment shape (`SHOW_LANDING`, the same flag that
 * decides whether there is a marketing page at all), and `OPERATOR_*` overrides
 * them in either direction.
 *
 * Server-only: these values are read from `process.env` and rendered by server
 * components. Anything a client component needs is passed down as a prop.
 */
export const REPO_URL = "https://github.com/krisztianhadi/ghosted";
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;

/**
 * The hosted instance's operator, and the shape every other instance is asked
 * to fill in.
 *
 * `name` is the trading name — an alias is enough to *trade* under, and plenty
 * of solo developers use one — but it is not a separate legal person and, in
 * several jurisdictions, it is not enough on its own: the imprint duty
 * (Germany's DDG §5 and its equivalents), the GDPR's requirement that a
 * controller be identifiable, and consumer/trader-information rules all want
 * the human or entity behind the name. So the alias and the person are stated
 * together, and a sole trader says so, because a business with no register
 * entry looks unfinished only until it says why.
 */
const HOSTED_OPERATOR = {
  name: "No More Names Studio",
  legalName: "Krisztian Hadi",
  soleTrader: true,
  register: null as string | null,
  vat: null as string | null,
  email: "hey@nomorenames.studio",
  // The studio's own site: where somebody with a question about the hosted
  // instance ends up, rather than an email client.
  url: "https://nomorenames.studio",
};

/**
 * The hosted instance's own tracker. Kept as a default rather than a required
 * variable so that upgrading an existing deployment does not silently stop its
 * analytics; a self-hosted shape gets nothing, which is the point of the
 * deployment flags.
 */
const HOSTED_UMAMI: UmamiConfig = {
  src: "https://ramen.nomorenames.studio/script.js",
  websiteId: "c8f73665-dca1-464b-9427-a56f8b27c799",
  domains: "ghosted.boo",
};

export interface Operator {
  /** The trading name — what the site is signed with. */
  name: string;
  /** The person or entity behind the trading name, when one is stated. */
  legalName: string | null;
  /** True when there is deliberately no commercial-register entry. */
  soleTrader: boolean;
  /** e.g. "Commercial register: HRB 12345", when one exists. */
  register: string | null;
  vat: string | null;
  email: string | null;
  url: string | null;
}

export interface UmamiConfig {
  src: string;
  websiteId: string;
  /** Optional `data-domains`, so a hoster can keep localhost out of the stats. */
  domains: string | null;
}

export interface SiteIdentity {
  poweredByUrl: string;
  /** `null` when this instance's operator has published no details. */
  operator: Operator | null;
  /** The word after the wordmark, or null for none. */
  brandTag: string | null;
  /** `false` emits `noindex` and a disallowing `robots.txt`. */
  indexable: boolean;
  /** `null` means no tracker is rendered at all. */
  umami: UmamiConfig | null;
}

function text(env: Record<string, string | undefined>, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

export function readSiteIdentity(
  config: RuntimeConfig,
  env: Record<string, string | undefined> = process.env,
): SiteIdentity {
  const hosted = config.showLanding;
  const statedName = text(env, "OPERATOR_NAME");

  // No stated operator: the hosted instance keeps its studio, a self-hosted one
  // says nothing rather than claiming to be somebody else.
  const operator: Operator | null = statedName
    ? {
        name: statedName,
        legalName: text(env, "OPERATOR_LEGAL_NAME"),
        soleTrader: readBooleanFlag(env, "OPERATOR_SOLE_TRADER", false),
        register: text(env, "OPERATOR_REGISTER"),
        vat: text(env, "OPERATOR_VAT"),
        email: text(env, "OPERATOR_EMAIL"),
        url: text(env, "OPERATOR_URL"),
      }
    : hosted
      ? {
          ...HOSTED_OPERATOR,
          // Still overridable, so the hosted instance needs no configuration to
          // stay correct while anything else can replace it.
          legalName: text(env, "OPERATOR_LEGAL_NAME") ?? HOSTED_OPERATOR.legalName,
          register: text(env, "OPERATOR_REGISTER"),
          vat: text(env, "OPERATOR_VAT"),
          email: text(env, "OPERATOR_EMAIL") ?? HOSTED_OPERATOR.email,
          url: text(env, "OPERATOR_URL") ?? HOSTED_OPERATOR.url,
        }
      : null;

  const statedTag = env.BRAND_TAG?.trim();
  const brandTag =
    statedTag === undefined
      ? hosted
        ? null
        : "DIY"
      : statedTag.toLowerCase() === "none"
        ? null
        : statedTag;

  const indexable = readIndexable(config, env);
  const src = text(env, "UMAMI_SRC");
  const websiteId = text(env, "UMAMI_WEBSITE_ID");

  return {
    poweredByUrl: text(env, "POWERED_BY_URL") ?? REPO_URL,
    operator,
    brandTag,
    indexable,
    // Explicit configuration wins; otherwise the hosted instance keeps the
    // tracker it always had, and any other shape renders none.
    umami:
      src || websiteId
        ? src && websiteId
          ? { src, websiteId, domains: text(env, "UMAMI_DOMAINS") }
          : null
        : hosted
          ? {
              ...HOSTED_UMAMI,
              domains: text(env, "UMAMI_DOMAINS") ?? HOSTED_UMAMI.domains,
            }
          : null,
  };
}

/**
 * Whether search engines may index this instance. Derived from the landing flag
 * so that the hosted instance keeps the behaviour it already had and a
 * self-hosted one is private by default, with `SITE_INDEXABLE` as the explicit
 * override in both directions. Parsed by the shared flag reader, so a typo here
 * stops the boot rather than quietly meaning a different privacy default.
 */
function readIndexable(
  config: RuntimeConfig,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return readBooleanFlag(env, "SITE_INDEXABLE", config.showLanding);
}

let cached: SiteIdentity | null = null;

/** The identity for this process, read once. Server components only. */
/**
 * The deployment's public origin, without a trailing slash.
 *
 * `NEXT_PUBLIC_APP_URL` is the deployment's own answer; the fallback is the
 * hosted instance, so a build with nothing set still emits absolute URLs rather
 * than relative ones that a crawler resolves against whatever host it saw.
 */
export function siteOrigin(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = env.NEXT_PUBLIC_APP_URL?.trim() || "https://ghosted.boo";
  return raw.replace(/\/+$/, "");
}

export function siteIdentity(): SiteIdentity {
  if (!cached) cached = readSiteIdentity(runtimeConfig());
  return cached;
}
