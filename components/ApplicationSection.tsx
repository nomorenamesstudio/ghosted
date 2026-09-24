"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApplicationStatus } from "@/lib/db/schema";
import { STATUS_TITLES, type DisplayStatus } from "@/lib/utils/status";
import { ApplicationCard } from "./ApplicationCard";
import { SkeletonGhostCard } from "./loading";
import { STATUS_ICONS as STATUS_ICONS_MAP } from "./status-icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SECTION_PAGE_SIZE,
  useApplicationSection,
  type SectionSort,
} from "./use-application-section";

/** Applications loaded per page per section; more are fetched on scroll. */
export { SECTION_PAGE_SIZE };

export function ApplicationSection({
  status,
  search,
  sort,
  collapsed,
  onToggle,
  onMove,
  seedReady = true,
  onTotalChange,
}: {
  status: DisplayStatus;
  search: string;
  sort: SectionSort;
  collapsed: boolean;
  onToggle: () => void;
  /** The card carries its own status, so `from` comes with the move. */
  onMove: (
    id: string,
    from: DisplayStatus,
    to: ApplicationStatus,
    company: string,
  ) => void;
  /** False until the board's single seed request has filled the caches. */
  seedReady?: boolean;
  onTotalChange: (status: DisplayStatus, total: number) => void;
}) {
  const {
    items,
    total,
    isPending,
    isFetching,
    error,
    canLoadMore,
    isLoadingMore,
    loadMore,
    sentinelRef,
  } = useApplicationSection({
    status,
    search,
    sort,
    collapsed,
    enabled: seedReady,
    onTotalChange,
  });

  const Icon = STATUS_ICONS_MAP[status];

  // First page still loading → skeleton for this section.
  if (isPending && items.length === 0) {
    return (
      <section data-testid={`section-${status}`}>
        <div className="mb-2 flex items-center gap-2 py-1">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
        <SkeletonGhostCard />
      </section>
    );
  }

  // Empty section → hidden entirely (the parent shows the global empty state).
  if (items.length === 0) return null;

  return (
    <section data-testid={`section-${status}`}>
      {/* Sticky header: stays below the app header while scrolling so
          sections can always be collapsed. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="sticky top-14 z-30 mb-2 flex w-full items-center gap-2 rounded-md bg-background/95 py-2 text-left text-sm font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Icon className="h-4 w-4" />
        {STATUS_TITLES[status]}
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
          {total}
        </span>
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 transition-transform",
            collapsed && "-rotate-90",
          )}
          aria-hidden
        />
      </button>

      {error && <p className="mb-2 text-sm text-destructive-readable">{error}</p>}

      {!collapsed && (
        <ul className="space-y-2">
          {items.map((app) => (
            <ApplicationCard key={app.id} app={app} onMove={onMove} />
          ))}
        </ul>
      )}

      {/* Per-section infinite-scroll sentinel — inside the section, reserves
          space while loading so the list doesn't jump. */}
      {!collapsed && (canLoadMore || isLoadingMore) && (
        <div ref={sentinelRef} className="space-y-3 py-2">
          {isLoadingMore ? (
            <>
              <SkeletonGhostCard />
              <SkeletonGhostCard />
            </>
          ) : (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={loadMore}>
                <ChevronDown className="h-4 w-4" />
                Load more
              </Button>
            </div>
          )}
        </div>
      )}

      {isFetching && (
        <p className="pt-1 text-xs text-muted-foreground">Refreshing…</p>
      )}
    </section>
  );
}
