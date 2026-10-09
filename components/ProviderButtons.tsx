"use client";

import { signIn } from "next-auth/react";
import { GoogleIcon, LinkedInIcon } from "@/components/provider-icons";
import { Button } from "@/components/ui/button";
import {
  OAUTH_PROVIDER_NAMES,
  type OAuthProvider,
} from "@/lib/config/oauth-providers";

/**
 * The provider buttons with the "or" divider that separates them from the email
 * form, rendered *above* that form on both auth pages.
 *
 * One component for both pages, and one order: the same button signs in and
 * signs up, which is the part people miss when they only meet it on one of the
 * two screens. Whether it creates an account is decided server-side (the
 * `signIn` callback refuses a sign-in that would create one while sign-ups are
 * closed).
 */
export function ProviderButtons({
  providers,
  callbackUrl = "/app",
}: {
  /** Providers this instance has credentials for, in display order. */
  providers: OAuthProvider[];
  callbackUrl?: string;
}) {
  if (providers.length === 0) return null;

  return (
    <div className="space-y-3">
      {providers.map((provider) => (
        <Button
          key={provider}
          type="button"
          variant="outline"
          className="w-full gap-3 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800"
          onClick={() => signIn(provider, { callbackUrl })}
        >
          {provider === "google" ? <GoogleIcon /> : <LinkedInIcon />}
          Continue with {OAUTH_PROVIDER_NAMES[provider]}
        </Button>
      ))}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">or</span>
        </div>
      </div>
    </div>
  );
}
