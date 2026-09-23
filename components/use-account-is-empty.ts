"use client";

import { useQuery } from "@tanstack/react-query";
import { getStats } from "@/lib/api";

/**
 * True while the account holds no applications at all — the state in which the
 * dashboard collapses to a single focus: the empty state, and nothing competing
 * with it. That means no toolbar (nothing to search, sort, switch or add to)
 * and no verification banner (its limit only starts to matter once there is
 * something to add).
 *
 * Two counts have to agree, because neither is sufficient alone.
 * `applicationCount` is the server's snapshot: authoritative on first paint, so
 * no toolbar flashes in before the empty state resolves, but stale after any
 * mutation. The stats query is live - every mutation invalidates it - but it
 * deliberately excludes archived applications, so on its own it would call an
 * archive-only account empty, hiding the toolbar over a board that is not
 * empty. Requiring both to read zero also brings everything back the moment the
 * first application is added from the empty state.
 *
 * Same query key as Dashboard, so this shares its cache rather than adding a
 * request.
 */
export function useAccountIsEmpty(applicationCount: number): boolean {
  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: () => getStats(),
  });

  return (
    applicationCount === 0 && (stats?.data?.total ?? applicationCount) === 0
  );
}
