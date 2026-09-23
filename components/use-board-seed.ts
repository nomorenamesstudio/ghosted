"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getBoard } from "@/lib/api";
import { STATUS_ORDER, type DisplayStatus } from "@/lib/utils/status";
import { SECTION_PAGE_SIZE, type SectionSort } from "./use-application-section";

/**
 * Fills every board section from a single request.
 *
 * The dashboard used to open with six requests — one per column — each fetching
 * its own first page and its own count. `GET /api/applications/board` answers all
 * of them at once (one partitioned query, totals included), so this hook asks for
 * that and writes each section straight into the cache entry its column reads:
 * `["applications", "section", status, { search, sort }]`, the same key
 * `useApplicationSection` uses for its own first page.
 *
 * The write happens *inside* `queryFn`, before the seed resolves. That ordering
 * is the point: a section mounts as soon as the seed is ready, and if the cache
 * were filled in an effect afterwards every column would fire its own request in
 * the gap — the fan-out would be back, just later.
 *
 * Failing is safe. A section's query is only gated while the seed is in flight;
 * once it settles without data, each section fetches for itself exactly as it did
 * before this hook existed, and `load more` keeps using the per-status endpoint
 * in either case.
 */
export function useBoardSeed({
  search,
  sort,
  enabled = true,
}: {
  search: string;
  sort: SectionSort;
  /**
   * False when only one section is on screen (the list view filtered to a
   * single status by the stat cards): then the per-status request is the cheaper
   * one and there is nothing to consolidate.
   */
  enabled?: boolean;
}): { seedReady: boolean } {
  const queryClient = useQueryClient();

  const seed = useQuery({
    queryKey: ["applications", "board", { search, sort }],
    enabled,
    queryFn: async () => {
      const board = await getBoard({
        search: search || undefined,
        sort,
        limit: SECTION_PAGE_SIZE,
      });

      for (const status of STATUS_ORDER) {
        const section = board.sections[status as DisplayStatus];
        if (section) {
          queryClient.setQueryData(
            ["applications", "section", status, { search, sort }],
            section,
          );
        }
      }
      return board;
    },
  });

  // `isPending` covers "still fetching"; a success has already seeded the cache
  // by the time it flips false, and an error means the sections take over.
  return { seedReady: !enabled || !seed.isPending };
}
