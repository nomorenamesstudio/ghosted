"use client";

import { Check, Link2 } from "lucide-react";
import {
  OAUTH_PROVIDER_NAMES,
  OAUTH_PROVIDERS,
  type OAuthProvider,
} from "@/lib/config/oauth-providers";
import { GoogleIcon, LinkedInIcon } from "@/components/provider-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Which sign-in providers are attached to this account.
 *
 * The row list is the union of what the deployment offers and what is already
 * linked: a provider whose credentials the operator has since removed keeps its
 * row, because the link it made is real and hiding it would make the account
 * look smaller than it is. Connect is only offered for a provider that can
 * actually start a flow.
 */
export function ConnectedAccountsCard({
  providers,
  linkedProviders,
  onConnect,
}: {
  /** The providers this deployment has credentials for. */
  providers: OAuthProvider[];
  /** The providers already attached to this account. */
  linkedProviders: OAuthProvider[];
  onConnect: (provider: OAuthProvider) => void;
}) {
  const rows = OAUTH_PROVIDERS.filter(
    (provider) =>
      providers.includes(provider) || linkedProviders.includes(provider),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Connected accounts
        </CardTitle>
        <CardDescription>
          Signing in with Google or LinkedIn attaches to this account when the
          provider uses the same email address — it never creates a second
          account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This instance has no single sign-on provider configured.
          </p>
        ) : (
          rows.map((provider) => {
            const linked = linkedProviders.includes(provider);
            const offered = providers.includes(provider);
            return (
              <div
                key={provider}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md border bg-background">
                    {provider === "google" ? <GoogleIcon /> : <LinkedInIcon />}
                  </span>
                  <p className="text-sm font-medium">
                    {OAUTH_PROVIDER_NAMES[provider]}
                  </p>
                </div>
                {linked ? (
                  <Badge variant="success" className="gap-1">
                    <Check className="h-3 w-3" />
                    Connected
                  </Badge>
                ) : offered ? (
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => onConnect(provider)}
                  >
                    Connect
                  </Button>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
