import { notFound } from "next/navigation";
import { renderEmailShell } from "@/lib/emails";

/**
 * LOCAL/DEV-ONLY email preview (404 in production). Lets us iterate on the
 * HTML templates in a browser: shows the verification + password-reset
 * emails in an inbox-style frame, plus their plain-text versions.
 */

const PREVIEW_URL = "https://ghosted.lostsignals.studio/verify-email?token=0xVERIFY0x";

function MailFrame({
  from,
  subject,
  html,
  text,
}: {
  from: string;
  subject: string;
  html: string;
  text: string;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{subject}</h2>
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        {/* Header bar */}
        <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          <span className="truncate font-medium text-foreground">{from}</span>
          <span className="shrink-0">to me</span>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 pt-3 text-sm">
          <span className="font-semibold">{subject}</span>
          <span className="shrink-0 text-xs text-muted-foreground">now</span>
        </div>
        <iframe title={subject} srcDoc={html} className="h-[480px] w-full border-0 bg-[#f4f4f5]" />
      </div>
      <details className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium">Plain-text version</summary>
        <pre className="mt-2 whitespace-pre-wrap font-mono text-xs leading-relaxed">{text}</pre>
      </details>
    </section>
  );
}

function EmailPreview() {
  const verifyText = `Welcome to Ghosted!

Please confirm your email address by opening this link:
${PREVIEW_URL}

If you didn't create an account, you can ignore this email.`;

  const resetText = `We received a request to reset your Ghosted password.

Open this link to choose a new one (valid for 1 hour):
${PREVIEW_URL.replace("verify-email", "reset-password")}

If you didn't request this, you can ignore this email.`;

  return (
    <main className="mx-auto max-w-2xl space-y-10 px-4 py-10">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-violet-600 dark:text-violet-400">
          Local preview — not deployed
        </p>
        <h1 className="text-2xl font-bold">Email templates</h1>
        <p className="text-sm text-muted-foreground">
          Iterating on the transactional emails. Buttons, branding and
          fallback links are inline-styled for email-client compatibility.
        </p>
      </div>

      <MailFrame
        from="Ghosted <ghosted@lostsignals.studio>"
        subject="Confirm your email — Ghosted"
        html={renderEmailShell({
          title: "Welcome to Ghosted!",
          body: `<p style="margin:0 0 4px;">Thanks for signing up — one quick step left.</p><p style="margin:0;">Confirm your email address to activate your account.</p>`,
          ctaLabel: "Confirm my email",
          ctaUrl: PREVIEW_URL,
          fallbackUrl: PREVIEW_URL,
          footerNote:
            "If you didn't create an account with Ghosted, you can safely ignore this email.",
        })}
        text={verifyText}
      />

      <MailFrame
        from="Ghosted <ghosted@lostsignals.studio>"
        subject="Reset your password — Ghosted"
        html={renderEmailShell({
          title: "Reset your password",
          body: `<p style="margin:0 0 4px;">We received a request to reset your Ghosted password.</p><p style="margin:0;">This link is valid for <strong>1 hour</strong>. If you didn't request it, nothing will change.</p>`,
          ctaLabel: "Choose a new password",
          ctaUrl: PREVIEW_URL.replace("verify-email", "reset-password"),
          fallbackUrl: PREVIEW_URL.replace("verify-email", "reset-password"),
          footerNote:
            "If you didn't request a password reset, you can safely ignore this email.",
        })}
        text={resetText}
      />
    </main>
  );
}

export default function EmailPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <EmailPreview />;
}
