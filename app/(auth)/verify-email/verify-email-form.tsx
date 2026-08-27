"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function VerifyEmailForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { status, update: updateSession } = useSession();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  // The effect can fire twice (StrictMode / searchParams identity) — a
  // second request would fail on the now-consumed token.
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    const token = params.get("token");
    if (!token) {
      setState("error");
      setError("This verification link is missing its token.");
      return;
    }
    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.ok) {
          setState("ok");
          // Refresh the JWT so the emailVerified flag flips immediately
          // (hides the verification banner without a re-login).
          if (status === "authenticated") {
            await updateSession({ emailVerified: true } as never);
          }
        } else {
          const body = await res.json().catch(() => null);
          setState("error");
          setError(body?.error ?? "Verification failed.");
        }
      })
      .catch(() => {
        setState("error");
        setError("Network error — please try again.");
      });
  }, [params, status, updateSession]);

  // Signed-in users who verified get dropped back into the app.
  useEffect(() => {
    if (state === "ok" && status === "authenticated") {
      const t = setTimeout(() => router.push("/app"), 1500);
      return () => clearTimeout(t);
    }
  }, [state, status, router]);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <span
          className={`flex h-12 w-12 items-center justify-center rounded-full ${
            state === "ok"
              ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
              : state === "error"
                ? "bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400"
                : "bg-muted text-muted-foreground"
          }`}
          aria-hidden
        >
          {state === "loading" ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : state === "ok" ? (
            <CheckCircle2 className="h-6 w-6" />
          ) : (
            <XCircle className="h-6 w-6" />
          )}
        </span>
        <CardTitle>
          {state === "loading"
            ? "Verifying your email…"
            : state === "ok"
              ? "Email verified"
              : "Verification failed"}
        </CardTitle>
        <CardDescription>
          {state === "ok"
            ? status === "authenticated"
              ? "You're all set — taking you back to your dashboard."
              : "Your email address is confirmed. You can now sign in."
            : "We couldn't verify this email address."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state === "error" && (
          <p role="alert" className="text-center text-sm text-destructive">
            {error}
          </p>
        )}
        <Button className="w-full" asChild>
          <Link
            href={
              state === "ok"
                ? status === "authenticated"
                  ? "/app"
                  : "/login"
                : "/login"
            }
          >
            {state === "ok"
              ? status === "authenticated"
                ? "Go to dashboard"
                : "Sign in"
              : "Sign in"}
          </Link>
        </Button>
        {state === "error" && (
          <p className="text-center text-xs text-muted-foreground">
            Request a new link from your account settings, or sign in to
            resend it.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
