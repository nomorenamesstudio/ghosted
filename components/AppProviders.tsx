"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { SessionCacheClearer } from "@/components/SessionCacheClearer";

/**
 * The auth + data layer, mounted only by the route groups that actually use it:
 * `(dashboard)` and `(auth)`. It used to sit in the root layout, which meant the
 * marketing landing page and the legal pages — static, no session, no queries —
 * shipped and hydrated next-auth and react-query anyway, and paid for a
 * `/api/auth/session` request on every visit from a signed-out stranger.
 *
 * One QueryClient per mount, so crossing the auth/dashboard boundary starts a
 * fresh cache: the leak-proofing SessionCacheClearer does between users now also
 * happens between the two groups for free.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        {/* Clears the query cache on login/logout/user-switch so no account's
            data can leak into another session. */}
        <SessionCacheClearer />
        {children}
      </QueryClientProvider>
    </SessionProvider>
  );
}
