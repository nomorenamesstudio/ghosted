"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Purges the TanStack Query cache whenever the authenticated user *changes*
 * (logout, or switching to a different account). The QueryClient lives in the
 * root Providers and survives client-side navigation, so without this a
 * freshly logged-in user would keep seeing the previous user's cached queries
 * (applications, stats, milestones, export) until a manual refresh.
 *
 * Only acts once the session has resolved (not while it is still loading):
 * the first resolution records the current user and clears nothing, so the
 * queries a page just fetched are never wiped on initial load.
 */
export function SessionCacheClearer() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const lastUserId = useRef<string | null>(null);
  const recorded = useRef(false);

  useEffect(() => {
    // Session still loading - do nothing, wait for a resolved value.
    if (status === "loading") return;

    const userId = session?.user?.id ?? null;

    if (!recorded.current) {
      // First resolved value (authenticated or not): record it, clear nothing.
      recorded.current = true;
      lastUserId.current = userId;
      return;
    }

    if (userId !== lastUserId.current) {
      lastUserId.current = userId;
      // Real user change (login, logout, or account switch) - drop every
      // cached query so nothing of the previous account leaks across.
      queryClient.clear();
    }
  }, [status, session?.user?.id, queryClient]);

  return null;
}
