"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Shared verification UI logic: resend the verification email and remember
 * the "Later" dismissal. Used by both the dashboard banner and the
 * verification modal so they stay in sync.
 */
export const VERIFY_STORAGE_KEY = "ghosted-verify-banner";
export const VERIFY_HIDE_MS = 24 * 60 * 60 * 1000; // one day

export function readVerifyDismissal(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(VERIFY_STORAGE_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

export function writeVerifyDismissal(hiddenUntil: number): void {
  try {
    localStorage.setItem(VERIFY_STORAGE_KEY, String(hiddenUntil));
  } catch {
    /* ignore storage errors */
  }
}

export function useVerification() {
  // Deliberately *not* seeded from localStorage, even though the dismissal is
  // read-only and the value is right there: the server has no localStorage, so
  // starting dismissed hid the banner the server had already rendered. Every
  // sibling after it shifted by one node and React reported the desync wherever
  // it happened to look next — in practice the search icon inside
  // `ApplicationList`: "Expected server HTML to contain a matching <svg> in
  // <div>". The stored preference is applied a tick later instead, exactly as
  // the board/list view preference is. Regression guard:
  // tests/e2e/hydration.spec.ts.
  const [hiddenUntil, setHiddenUntil] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setHiddenUntil(readVerifyDismissal());
  }, []);

  const dismissed = hiddenUntil !== null && Date.now() < hiddenUntil;

  const resend = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to send verification email");
      }
      setMessage("Verification email sent - check your inbox.");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const later = useCallback(() => {
    writeVerifyDismissal(Date.now() + VERIFY_HIDE_MS);
    setHiddenUntil(Date.now() + VERIFY_HIDE_MS);
  }, []);

  return { busy, message, resend, later, dismissed };
}
