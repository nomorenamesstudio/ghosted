"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, MailWarning } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Verification-banner logic: shown at the top of the dashboard while the
 * account email is unverified. "Later" hides it for 24h (localStorage).
 */
const VERIFY_STORAGE_KEY = "ghosted-verify-banner";
const VERIFY_HIDE_MS = 24 * 60 * 60 * 1000; // one day

function readDismissal(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(VERIFY_STORAGE_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function writeDismissal(hiddenUntil: number): void {
  try {
    localStorage.setItem(VERIFY_STORAGE_KEY, String(hiddenUntil));
  } catch {
    /* ignore storage errors */
  }
}

export function VerificationBanner() {
  const { data: session } = useSession();
  const [hiddenUntil, setHiddenUntil] = useState<number | null>(readDismissal);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const unverified = session?.user?.emailVerified === false;
  if (!unverified) return null;
  if (hiddenUntil !== null && Date.now() < hiddenUntil) return null;

  async function resend() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to send verification email");
      }
      setMessage("Verification email sent — check your inbox.");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function later() {
    writeDismissal(Date.now() + VERIFY_HIDE_MS);
    setHiddenUntil(Date.now() + VERIFY_HIDE_MS);
  }

  return (
    <div className="border-b border-amber-300/50 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/40">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <MailWarning
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <div className="text-sm">
            <p className="font-medium text-amber-950 dark:text-amber-50">
              Verify your email to keep tracking applications
            </p>
            <p className="text-amber-900 dark:text-amber-100">
              Unverified accounts are limited to 3 applications. We emailed
              you a link — click it, or resend below.
            </p>
            {message && (
              <p className="mt-1 font-medium text-amber-950 dark:text-amber-50">
                {message}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={resend}
            disabled={busy}
            className="border-amber-500/60 text-amber-950 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-50 dark:hover:bg-amber-900/50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Sending…" : "Resend email"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={later}
            className="text-amber-950 hover:bg-amber-100 dark:text-amber-50 dark:hover:bg-amber-900/50"
          >
            Later
          </Button>
        </div>
      </div>
    </div>
  );
}
