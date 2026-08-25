import { Resend } from "resend";
import { logger } from "@/lib/utils/logger";

let client: Resend | null = null;

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send a transactional email.
 * - No `RESEND_API_KEY` → dev stub: the email is logged instead (structured).
 * - Provider errors are logged but never thrown: sending mail must not break
 *   the calling flow (e.g. registration).
 */
export async function sendEmail({
  to,
  subject,
  text,
  html,
}: EmailMessage): Promise<void> {
  const from =
    process.env.EMAIL_FROM ?? "Ghosted <onboarding@resend.dev>";
  const c = getClient();
  if (!c) {
    logger.info(
      { to, subject },
      `[email stub — set RESEND_API_KEY to send] ${subject}\n\n${text}`,
    );
    return;
  }
  try {
    await c.emails.send({ from, to, subject, text, html: html ?? text });
    logger.info({ to, subject }, "email sent");
  } catch (err) {
    logger.error({ err, to, subject }, "email send failed");
  }
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function sendVerificationEmail(to: string, token: string) {
  const url = `${appUrl()}/verify-email?token=${token}`;
  return sendEmail({
    to,
    subject: "Verify your email — Ghosted",
    text: `Welcome to Ghosted!\n\nPlease confirm your email address by opening this link:\n${url}\n\nIf you didn't create an account, you can ignore this email.`,
    html: `<p>Welcome to <strong>Ghosted</strong>!</p><p>Please confirm your email address by opening this link:</p><p><a href="${url}">${url}</a></p><p>If you didn't create an account, you can ignore this email.</p>`,
  });
}

export function sendPasswordResetEmail(to: string, token: string) {
  const url = `${appUrl()}/reset-password?token=${token}`;
  return sendEmail({
    to,
    subject: "Reset your password — Ghosted",
    text: `We received a request to reset your Ghosted password.\n\nOpen this link to choose a new one (valid for 1 hour):\n${url}\n\nIf you didn't request this, you can ignore this email.`,
    html: `<p>We received a request to reset your <strong>Ghosted</strong> password.</p><p>Open this link to choose a new one (valid for 1 hour):</p><p><a href="${url}">${url}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
  });
}
