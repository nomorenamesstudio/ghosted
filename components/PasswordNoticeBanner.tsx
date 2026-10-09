"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Tells the person that a provider sign-in cleared their password.
 *
 * Only an *unverified* account loses its password when Google or LinkedIn takes
 * it over (the adopt rule in lib/services/oauth-accounts.ts), because a password
 * set on an address nobody had proved they owned may have belonged to whoever
 * registered it first. That is worth saying out loud rather than leaving them to
 * discover it at the login form — so the dashboard says it once, and dismissing
 * is the acknowledgement (the server clears the marker; this is not a
 * localStorage "Later" like the verification banner, which comes back tomorrow).
 *
 * Same shape and tone as VerificationBanner, and the two never appear together:
 * adopting an account also marks its email verified.
 */
export function PasswordNoticeBanner({ show }: { show: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!show || dismissed) return null;

  async function dismiss() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/dismiss-password-notice", {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to dismiss this notice");
      }
      setDismissed(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      aria-label="Password removed notice"
      className="relative border-amber-300/60 bg-amber-100/70 dark:border-amber-800/60 dark:bg-amber-950/40"
    >
      <CardContent className="relative flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-lg font-semibold text-amber-950 dark:text-amber-50">
            Your password was removed
          </p>
          <p className="text-sm text-amber-900 dark:text-amber-100">
            This address was never verified, so a password on it could have
            belonged to whoever registered it first. Signing in with a provider
            cleared it — set a new one if you want to sign in with email as well.
          </p>
          {error && (
            <p role="alert" className="text-sm font-medium text-amber-950 dark:text-amber-50">
              {error}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            asChild
            className="bg-amber-700 text-white hover:bg-amber-800"
          >
            <Link href="/settings">Set a password</Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-amber-400/70 text-amber-900 hover:bg-amber-200/60 dark:border-amber-700 dark:text-amber-100 dark:hover:bg-amber-900/40"
            onClick={dismiss}
            disabled={busy}
          >
            {busy ? "Dismissing…" : "Dismiss"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
