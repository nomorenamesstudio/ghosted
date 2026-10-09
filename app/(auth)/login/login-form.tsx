"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProviderButtons } from "@/components/ProviderButtons";
import { type OAuthProvider } from "@/lib/config/oauth-providers";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LoginForm({
  providers,
  allowRegistration,
}: {
  providers: OAuthProvider[];
  /** False on an instance whose sign-ups are closed. */
  allowRegistration: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const registered = params.get("registered") === "1";
  const passwordChanged = params.get("passwordChanged") === "1";

  // Auth.js sends a refused provider sign-in back here as `?error=`. The two the
  // sign-in gate produces get the operator's meaning; anything else stays silent
  // rather than showing a user an internal error code.
  const providerError = params.get("error");
  const providerMessage =
    providerError === "RegistrationClosed"
      ? "This instance is not accepting new accounts. Sign in with the email address you registered with, or ask the operator for one."
      : providerError === "OAuthEmailRequired"
        ? "That provider shared no email address, so it cannot be matched to a Ghosted account. Add a verified email there, or sign in with email and password."
        : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        // Purge the query cache: the QueryClient lives across client-side
        // navigation, so without this a freshly logged-in user would keep
        // seeing the previous user's cached applications/stats/milestones.
        queryClient.clear();
        // Only follow same-origin relative callbackUrls — never allow the
        // login page to redirect the browser to an arbitrary external origin.
        const callbackUrl = params.get("callbackUrl");
        const safe =
          callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
            ? callbackUrl
            : "/app";
        router.push(safe);
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Login failed");
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Welcome back to Ghosted.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {passwordChanged && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Password saved — sign in with your new one.
          </p>
        )}

        {registered && (
          <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-800">
            Account created - sign in below.
          </p>
        )}

        {providerMessage && (
          <p role="alert" className="text-sm text-destructive">
            {providerMessage}
          </p>
        )}

        {/* Providers first: one button does both jobs, and leading with it is
            the only order that reads the same on the register page. */}
        <ProviderButtons providers={providers} />

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground underline underline-offset-[3px] transition-colors hover:text-primary"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            <LogIn />
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        {allowRegistration && (
          <p className="text-center text-sm text-muted-foreground">
            No account?{" "}
            <Link href="/register" className="underline">
              Register
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
