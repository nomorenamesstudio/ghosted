import { Resend } from "resend";
import type { EmailTransport } from "./types";

/**
 * Resend over its HTTP API — the hosted instance's transport, and the one a
 * self-hoster gets for free (their free tier covers a family easily).
 */
export function createResendTransport(apiKey: string): EmailTransport {
  const client = new Resend(apiKey);
  return {
    name: "resend",
    delivers: true,
    async send(message, from) {
      const { data, error } = await client.emails.send({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html ?? message.text,
      });
      if (error) throw new Error(`Resend: ${error.message}`);
      return { id: data?.id };
    },
  };
}
