/**
 * The email seam's vocabulary.
 *
 * A transport delivers one message; nothing above this line knows whether that
 * means an HTTP call to Resend, an SMTP conversation, or a line in the log.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Always present: it is the fallback every client can read. */
  text: string;
  html?: string;
}

export interface SentMessage {
  /** Provider-assigned id, when the transport has one. */
  id?: string;
}

export interface EmailTransport {
  /** For the boot log and error messages. */
  readonly name: string;
  /**
   * `false` for transports that only *record* a message (the dev log stub).
   * Deployment validation reads this: an instance where strangers can register
   * needs verification and reset mail to actually arrive.
   */
  readonly delivers: boolean;
  send(message: EmailMessage, from: string): Promise<SentMessage | null>;
}

export type TransportName = "resend" | "smtp" | "log";

export const TRANSPORT_NAMES: readonly TransportName[] = ["resend", "smtp", "log"];

export function isTransportName(value: string): value is TransportName {
  return (TRANSPORT_NAMES as readonly string[]).includes(value);
}
