import { logger } from "@/lib/utils/logger";
import { emailTransport, type EmailMessage } from "@/lib/email/transport";

const IS_PROD = process.env.NODE_ENV === "production";

export type { EmailMessage };

/**
 * Send a transactional email through whichever transport this deployment
 * configured (`lib/email/`): Resend, SMTP, or the log stub.
 *
 * - Provider failures are logged but never thrown: sending mail must not break
 *   the calling flow (e.g. registration).
 * - Configuration failures throw, and the deployment validation in
 *   `lib/config/flags.ts` catches the important ones at boot instead.
 */
/**
 * `true` when the transport accepted the message, `false` when it did not.
 *
 * It used to swallow every failure and return nothing, which meant a caller
 * could only ever report "sent". A transient provider outage then looked exactly
 * like success to the person waiting for the mail. Callers that can safely say
 * so (the authenticated resend button) now do; the rest still just log, because
 * telling an anonymous visitor "we could not send that" leaks whether an account
 * exists.
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const transport = emailTransport();
  const from = process.env.EMAIL_FROM;

  // Only a transport that really sends needs a From address on a domain the
  // operator controls; a solo instance on the log stub never sends at all.
  if (transport.delivers && !from && IS_PROD) {
    logger.error("EMAIL_FROM is not set — mail would come from a provider test domain");
    throw new Error("Email configuration error: EMAIL_FROM is not set");
  }
  const resolvedFrom = from ?? "Ghosted <onboarding@resend.dev>";

  try {
    await transport.send(message, resolvedFrom);
    logger.info(
      { to: message.to, subject: message.subject, transport: transport.name },
      "email sent",
    );
    return true;
  } catch (err) {
    logger.error(
      { err, to: message.to, subject: message.subject, transport: transport.name },
      "email send failed",
    );
    return false;
  }
}

function appUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) {
    // A verification/reset link pointing at localhost would be dead on
    // arrival in production — fail fast instead of emailing broken links.
    if (IS_PROD) {
      logger.error("NEXT_PUBLIC_APP_URL is not set — emailed links would be broken");
      throw new Error("Email configuration error: NEXT_PUBLIC_APP_URL is not set");
    }
  }
  return url ?? "http://localhost:3000";
}

/* ------------------------------------------------------------------ */
/* HTML email shell                                                    */
/* ------------------------------------------------------------------ */

const EMAIL_BRAND = "#6d28d9"; // violet-700 (passes AA with white text)

/** The landing-page ghost, inline SVG (static, self-contained). */
const GHOST_MARK = `<svg width="46" height="46" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ghosted">
  <path d="M16.7 41.7 C16.7 18 33.3 8.3 50 8.3 C66.7 8.3 83.3 18 83.3 41.7 L83.3 91.7 L70.8 79.2 L60.4 89.6 L50 79.2 L39.6 89.6 L29.2 79.2 L16.7 91.7 Z" fill="${EMAIL_BRAND}" fill-opacity="0.15" stroke="${EMAIL_BRAND}" stroke-width="3.5" stroke-linejoin="round"/>
  <rect x="34" y="36.7" width="7" height="10" rx="3.5" fill="${EMAIL_BRAND}"/>
  <rect x="59" y="36.7" width="7" height="10" rx="3.5" fill="${EMAIL_BRAND}"/>
</svg>`;

interface EmailShellOptions {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  fallbackUrl?: string;
  footerNote?: string;
}

/**
 * Minimal, table-based HTML email with inline styles (safe across email
 * clients). Centered layout, a violet ghost brand mark, a roomy CTA button
 * and a plain-text URL fallback (buttons are blocked by some clients).
 */
export function renderEmailShell({
  title,
  body,
  ctaLabel,
  ctaUrl,
  fallbackUrl,
  footerNote,
}: EmailShellOptions): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const cta = ctaLabel && ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
         <tr>
           <td align="center" style="padding:28px 0 6px;">
             <a href="${escape(ctaUrl)}" target="_blank"
                style="display:inline-block;background-color:${EMAIL_BRAND};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:15px 44px;border-radius:10px;">
               ${escape(ctaLabel)}
             </a>
           </td>
         </tr>
       </table>`
    : "";
  const fallback = fallbackUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
         <tr>
           <td align="center" style="padding:22px 0 0;color:#71717a;font-size:12px;line-height:1.6;">
             Having trouble with the button? Copy and paste this link into your browser:<br/>
             <span style="word-break:break-all;color:#3f3f46;">${escape(fallbackUrl)}</span>
           </td>
         </tr>
       </table>`
    : "";
  const note = footerNote
    ? `<tr><td align="center" style="padding:12px 0 0;color:#a1a1aa;font-size:12px;">${footerNote}</td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<!--
  Both stacks are deliberately system stacks: no mail client loads our webfont, so
  asking for Geist here would buy nothing and fall back to whatever the client
  has. The wordmark's "beta" is the one place a monospace face is wanted, and it
  asks for the sanest system monospace first rather than a font that will not be
  there.
-->
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    ${GHOST_MARK}
                    <div style="padding-top:10px;color:#18181b;font-size:18px;font-weight:700;letter-spacing:-0.02em;text-align:center;">Ghosted<span style="color:${EMAIL_BRAND};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;margin-left:4px;font-size:11px;font-weight:600;vertical-align:super;">beta</span></div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border-radius:12px;padding:36px 32px;">
              <h1 style="margin:0 0 16px;color:#18181b;font-size:20px;font-weight:700;letter-spacing:-0.02em;text-align:center;">${escape(title)}</h1>
              <div style="color:#52525b;font-size:15px;line-height:1.6;text-align:center;">${body}</div>
              ${cta}
              ${fallback}
            </td>
          </tr>
          ${note}
          <tr>
            <td align="center" style="padding:24px 0 0;color:#a1a1aa;font-size:12px;line-height:1.7;">
              Ghosted · For the Job Hunters<br/>
              Made with ❤ by No More Names Studio
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function sendVerificationEmail(to: string, token: string): Promise<boolean> {
  const url = `${appUrl()}/verify-email?token=${token}`;
  return sendEmail({
    to,
    subject: "Confirm your email — Ghosted",
    text: `Welcome to Ghosted!\n\nPlease confirm your email address by opening this link:\n${url}\n\nIf you didn't create an account, you can ignore this email.`,
    html: renderEmailShell({
      title: "Welcome to Ghosted!",
      body: `<p style="margin:0 0 4px;">Thanks for signing up — one quick step left.</p><p style="margin:0;">Confirm your email address to activate your account.</p>`,
      ctaLabel: "Confirm my email",
      ctaUrl: url,
      fallbackUrl: url,
      footerNote: "If you didn't create an account with Ghosted, you can safely ignore this email.",
    }),
  });
}

export function sendPasswordResetEmail(to: string, token: string): Promise<boolean> {
  const url = `${appUrl()}/reset-password?token=${token}`;
  return sendEmail({
    to,
    subject: "Reset your password — Ghosted",
    text: `We received a request to reset your Ghosted password.\n\nOpen this link to choose a new one (valid for 1 hour):\n${url}\n\nIf you didn't request this, you can ignore this email.`,
    html: renderEmailShell({
      title: "Reset your password",
      body: `<p style="margin:0 0 4px;">We received a request to reset your Ghosted password.</p><p style="margin:0;">This link is valid for <strong>1 hour</strong>. If you didn't request it, nothing will change.</p>`,
      ctaLabel: "Choose a new password",
      ctaUrl: url,
      fallbackUrl: url,
      footerNote: "If you didn't request a password reset, you can safely ignore this email.",
    }),
  });
}
