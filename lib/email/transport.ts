import { logger } from "@/lib/utils/logger";
import type { EmailMessage, EmailTransport } from "./types";
import { createResendTransport } from "./resend";
import { createSmtpTransport, parseSmtpUrl } from "./smtp";
import { createLogTransport } from "./log";
import { ConfigError } from "@/lib/config/error";

/**
 * Which transport this deployment sends through, and whether that choice can
 * actually deliver.
 *
 * Resolution: an explicit `EMAIL_TRANSPORT` always wins; otherwise Resend when
 * `RESEND_API_KEY` is set and the log stub when it is not — the same behaviour
 * the app had before transports existed, so nothing changes for the hosted
 * instance.
 *
 * These readers are pure: they never touch the network and never log, so the
 * deployment validation in `lib/config/flags.ts` can ask "would this config
 * deliver mail?" without sending anything.
 */

export interface TransportChoice {
  name: "resend" | "smtp" | "log";
  /** `false` only for the log stub: it records a message instead of sending it. */
  delivers: boolean;
  problems: string[];
}

export function readTransportChoice(
  env: Record<string, string | undefined> = process.env,
): TransportChoice {
  const problems: string[] = [];
  const explicit = env.EMAIL_TRANSPORT?.trim().toLowerCase();
  const resendKey = env.RESEND_API_KEY?.trim();
  const smtpUrl = env.SMTP_URL?.trim();

  let name: TransportChoice["name"];
  if (explicit) {
    if (explicit !== "resend" && explicit !== "smtp" && explicit !== "log") {
      problems.push(
        `EMAIL_TRANSPORT="${explicit}" is not a transport — use resend, smtp or log`,
      );
      return { name: "log", delivers: false, problems };
    }
    name = explicit;
  } else {
    name = resendKey ? "resend" : "log";
  }

  if (name === "resend" && !resendKey) {
    problems.push("EMAIL_TRANSPORT=resend needs RESEND_API_KEY");
  }
  if (name === "smtp") {
    if (!smtpUrl) {
      problems.push(
        "EMAIL_TRANSPORT=smtp needs SMTP_URL (smtps://user:pass@host:465)",
      );
    } else {
      try {
        parseSmtpUrl(smtpUrl);
      } catch (error) {
        problems.push((error as Error).message);
      }
    }
  }

  return { name, delivers: name !== "log", problems };
}

/** Throws `ConfigError` listing every problem, so a bad deploy fails at boot. */
export function resolveEmailTransport(
  env: Record<string, string | undefined> = process.env,
): EmailTransport {
  const choice = readTransportChoice(env);
  if (choice.problems.length > 0) throw new ConfigError(choice.problems);

  if (choice.name === "resend") {
    return createResendTransport(env.RESEND_API_KEY!.trim());
  }
  if (choice.name === "smtp") {
    return createSmtpTransport(parseSmtpUrl(env.SMTP_URL!.trim()));
  }
  return createLogTransport();
}

let cached: EmailTransport | null = null;

/** The transport for this process, resolved once and reported in the boot log. */
export function emailTransport(): EmailTransport {
  if (!cached) {
    cached = resolveEmailTransport();
    logger.info(
      { transport: cached.name, delivers: cached.delivers },
      "email transport",
    );
  }
  return cached;
}

export type { EmailMessage, EmailTransport };
