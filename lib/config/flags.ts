import { logger } from "@/lib/utils/logger";
import { ConfigError } from "@/lib/config/error";
import { readBooleanFlagRaw, type EnvRecord } from "@/lib/config/flag-parse";
import { readTransportChoice } from "@/lib/email/transport";

export { ConfigError };

/**
 * Runtime configuration for the self-hosted shapes of the app.
 *
 * Two flags, deliberately not one `MODE`: whether `/` serves the marketing
 * landing, and whether strangers may register. A solo instance wants the login
 * screen as its starter with registration closed; a family instance wants the
 * same starter with registration open; the hosted instance wants the landing.
 * Both default to the hosted behaviour, so a deployment that sets nothing is
 * unchanged by an upgrade.
 *
 * Server-side only. Anything a client component needs must be passed down as a
 * prop (or be `NEXT_PUBLIC_*`), otherwise one published image stops being
 * configurable by environment alone.
 */
export interface RuntimeConfig {
  /** `false` sends `/` to `/login` instead of rendering the landing page. */
  showLanding: boolean;
  /** `false` hides the register form, OAuth sign-up and "add account" paths. */
  allowRegistration: boolean;
  /** The boot-seeded owner account, when registration is closed. */
  ownerEmail: string | null;
  ownerName: string | null;
}

/** A plain env bag: `process.env` satisfies it, a literal object in a test does too. */
export type { EnvRecord };

/**
 * Strict policy on top of the shared parser: `ALLOW_REGISTRATION=flase` must
 * stop the boot rather than quietly mean "the default". The parse itself lives
 * in `lib/config/flag-parse.ts` because middleware needs the same rule without
 * the dependencies this module drags in.
 */
function readFlag(
  env: EnvRecord,
  name: string,
  fallback: boolean,
  problems: string[],
): boolean {
  const read = readBooleanFlagRaw(env[name]);
  if (read.kind === "value") return read.value;
  if (read.kind === "invalid") {
    problems.push(
      `${name}="${read.raw}" is not a boolean — use true/false, 1/0, yes/no or on/off`,
    );
  }
  return fallback;
}

/**
 * The boolean reader on its own, for the modules that want one flag and no
 * report: `lib/site.ts` reads `SITE_INDEXABLE` this way. Strict on purpose — a
 * typo on a privacy flag must stop the boot rather than silently mean the
 * default.
 */
export function readBooleanFlag(
  env: EnvRecord,
  name: string,
  fallback: boolean,
): boolean {
  const problems: string[] = [];
  const value = readFlag(env, name, fallback, problems);
  if (problems.length > 0) throw new ConfigError(problems);
  return value;
}

function readText(env: EnvRecord, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

/**
 * Pure reader: no caching, no logging, no side effects. Throws `ConfigError`
 * listing every problem at once, so a misconfigured deploy is fixed in one pass
 * instead of one variable per restart.
 */
export function readConfig(env: EnvRecord = process.env): RuntimeConfig {
  const problems: string[] = [];
  const config: RuntimeConfig = {
    showLanding: readFlag(env, "SHOW_LANDING", true, problems),
    allowRegistration: readFlag(env, "ALLOW_REGISTRATION", true, problems),
    ownerEmail: readText(env, "GHOSTED_USER_EMAIL"),
    ownerName: readText(env, "GHOSTED_USER_NAME"),
  };

  if (!config.allowRegistration && !config.ownerEmail) {
    problems.push(
      "ALLOW_REGISTRATION=false needs GHOSTED_USER_EMAIL — with sign-ups closed and no owner account there is no way into the instance",
    );
  }

  // Email: the transport itself must be coherent whenever it is configured, and
  // an instance where strangers can register needs mail that actually arrives —
  // verification and reset both go through it. A solo instance with closed
  // registration may run the log stub forever, which is why this only bites in
  // production with registration open.
  const transport = readTransportChoice(env);
  problems.push(...transport.problems);

  if (config.allowRegistration && env.NODE_ENV === "production") {
    if (!transport.delivers) {
      problems.push(
        "ALLOW_REGISTRATION=true needs a delivering email transport in production (RESEND_API_KEY, or EMAIL_TRANSPORT=smtp with SMTP_URL) — otherwise nobody can verify an address or reset a password. Set ALLOW_REGISTRATION=false for a solo instance.",
      );
    } else if (!readText(env, "EMAIL_FROM")) {
      problems.push(
        "EMAIL_FROM is not set — verification and reset mail would come from a provider test domain and land in spam",
      );
    }
  }

  if (problems.length > 0) throw new ConfigError(problems);
  return config;
}

let cached: RuntimeConfig | null = null;

/**
 * The config for this process, read and logged once. Import this from server
 * components and route handlers; it never runs in the browser.
 */
export function runtimeConfig(): RuntimeConfig {
  if (!cached) {
    cached = readConfig();
    const transport = readTransportChoice();
    logger.info(
      {
        showLanding: cached.showLanding,
        allowRegistration: cached.allowRegistration,
        emailTransport: transport.name,
        emailDelivers: transport.delivers,
      },
      "runtime config",
    );
  }
  return cached;
}
