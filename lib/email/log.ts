import { logger } from "@/lib/utils/logger";
import type { EmailTransport } from "./types";

/**
 * Token-bearing links are live credentials: the database keeps only the hash,
 * so a logged body is the one place a reset or verification token is readable
 * in the clear (static audit, third pass).
 *
 * Development keeps the link — the log *is* the mailbox there, and the docs send
 * a developer to the terminal to click it. Anywhere else the platform retains
 * the log, so the token is redacted and only the shape of the link survives.
 */
const TOKEN_IN_URL = /([?&]token=)[^\s&"'>]+/gi;
function forLog(body: string): string {
  if (process.env.NODE_ENV !== "production") return body;
  return body.replace(TOKEN_IN_URL, "$1<redacted>");
}

/** Where a logged message goes; injectable so a test can assert on it. */
export type EmailLogSink = (
  context: Record<string, unknown>,
  message: string,
) => void;

/**
 * The stub transport: it writes the message to the log instead of sending it.
 *
 * This is what development and the e2e suite run on — verification and reset
 * links land in the terminal, where a developer can click them — and what a
 * solo self-hosted instance can keep forever: with registration closed, nobody
 * needs mail to arrive. `delivers: false` is the flag deployment validation
 * reads to refuse the one combination that does need it.
 */
export function createLogTransport(
  log: EmailLogSink = logger.info.bind(logger),
): EmailTransport {
  return {
    name: "log",
    delivers: false,
    async send(message, from) {
      log(
        { to: message.to, from, subject: message.subject },
        `[email — log transport, nothing sent] ${message.subject}\n\n${forLog(message.text)}`,
      );
      return null;
    },
  };
}
