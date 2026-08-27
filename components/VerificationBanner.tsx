"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { useVerification } from "./use-verification";

/**
 * Verification banner, shown at the top of the dashboard while the account
 * email is unverified. Mirrors the DonateBanner structure (Card placed in the
 * same dashboard flow) with a muted amber tone. "Later" hides it for 24h.
 */
export function VerificationBanner({
  emailVerified,
  limit,
}: {
  /** From the server-side DB read; false ⇒ banner shown. */
  emailVerified?: boolean;
  /** Application cap for unverified accounts (server's UNVERIFIED_APP_LIMIT). */
  limit?: number;
}) {
  const { busy, message, resend, later, dismissed } = useVerification();

  if (emailVerified !== false) return null;
  if (dismissed) return null;

  return (
    <Card
      aria-label="Email verification notice"
      className="relative border-amber-300/60 bg-amber-100/70 dark:border-amber-800/60 dark:bg-amber-950/40"
    >
      <CardContent className="relative flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-lg font-semibold text-amber-950 dark:text-amber-50">
            Verify your email
          </p>
          <p className="text-sm text-amber-900 dark:text-amber-100">
            Unverified accounts are limited to {limit ?? 3} applications. We
            emailed you a link, simply click it and get verified immediately.
          </p>
          {message && (
            <p className="text-sm font-medium text-amber-950 dark:text-amber-50">
              {message}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            onClick={resend}
            disabled={busy}
            className="bg-amber-700 text-white hover:bg-amber-800"
          >
            {busy ? "Sending…" : "Resend email"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-amber-400/70 text-amber-900 hover:bg-amber-200/60 dark:border-amber-700 dark:text-amber-100 dark:hover:bg-amber-900/40"
            onClick={later}
          >
            Later
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
