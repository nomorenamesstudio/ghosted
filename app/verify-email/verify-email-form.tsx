"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [params]);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>
          {state === "loading"
            ? "Verifying…"
            : state === "ok"
              ? "Email verified"
              : "Verification failed"}
        </CardTitle>
        <CardDescription>
          {state === "ok"
            ? "Your email address is confirmed. You can now sign in."
            : "We couldn't verify this email address."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {error} Request a new link from your account settings, or register
            again.
          </p>
        )}
        <Button className="w-full" asChild>
          <Link href={state === "ok" ? "/login" : "/register"}>
            {state === "ok" ? "Sign in" : "Go to register"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
