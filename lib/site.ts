import {
  readBooleanFlag,
  runtimeConfig,
  type RuntimeConfig,
} from "@/lib/config/flags";

/**
 * Who runs *this* instance, and where the software came from.
 *
 * The distinction the rest of the app cares about: the hosted instance is
 * operated by Lost Signals Studio, a self-hosted one is operated by whoever
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

const HOSTED_OPERATOR = {
  name: "Lost Signals Studio",
  email: "hey@lostsignals.studio",
};

/**
 * The hosted instance's own tracker. Kept as a default rather than a required
 * variable so that upgrading an existing deployment does not silently stop its
 * analytics; a self-hosted shape gets nothing, which is the point of the
 * deployment flags.
 */
const HOSTED_UMAMI: UmamiConfig = {
  src: "https://ramen.lostsignals.studio/script.js",
  websiteId: "c8f73665-dca1-464b-9427-a56f8b27c799",
  domains: "ghosted.lostsignals.studio",
};

export interface Operator {
  name: string;
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
        email: text(env, "OPERATOR_EMAIL"),
        url: text(env, "OPERATOR_URL"),
      }
    : hosted
      ? { name: HOSTED_OPERATOR.name, email: HOSTED_OPERATOR.email, url: null }
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
export function siteIdentity(): SiteIdentity {
  if (!cached) cached = readSiteIdentity(runtimeConfig());
  return cached;
}
