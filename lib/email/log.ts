import { logger } from "@/lib/utils/logger";
import type { EmailTransport } from "./types";

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
        `[email — log transport, nothing sent] ${message.subject}\n\n${message.text}`,
      );
      return null;
    },
  };
}
