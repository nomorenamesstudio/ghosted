"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getApplicationsRevision } from "@/lib/api";

/**
 * Keeps an open board honest while something else is writing to it.
 *
 * The case: an agent files an application or moves a milestone through MCP, and
 * the board sitting on screen is stale until you navigate. Polling the board
 * itself would cost a request per column; this asks one tiny "did anything
 * change?" endpoint instead, and only then invalidates the caches the app already
 * invalidates after its own writes (`applications`, `application`, `stats`).
 *
 * Deliberately quiet: no spinner, no banner, nothing to dismiss — the cards simply
 * arrive. It also stops while the tab is hidden (react-query's default for a
 * background tab), so a board left open overnight is not a request per interval,
 * and it refetches the moment the tab comes back.
 */

/** Slow enough to be polite, fast enough to feel live while you watch it. */
const POLL_MS = 15_000;

export function LiveRefresh() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["board-revision"],
    queryFn: getApplicationsRevision,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    // The point is to see the latest answer, so no staleness window.
    staleTime: 0,
    // A failed poll is not worth a retry storm; the next tick tries again.
    retry: 0,
  });

  // The first answer is the baseline, not a change: invalidating on it would
  // refetch everything the page is already loading.
  const seen = useRef<string | null>(null);
  useEffect(() => {
    const revision = data?.data.revision;
    if (!revision) return;
    if (seen.current === null) {
      seen.current = revision;
      return;
    }
    if (seen.current === revision) return;
    seen.current = revision;
    void queryClient.invalidateQueries({ queryKey: ["applications"] });
    void queryClient.invalidateQueries({ queryKey: ["application"] });
    void queryClient.invalidateQueries({ queryKey: ["stats"] });
  }, [data, queryClient]);

  return null;
}
