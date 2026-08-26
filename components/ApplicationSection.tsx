"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { getApplications, type ApplicationListItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DisplayStatus } from "@/lib/utils/status";
import { ApplicationCard } from "./ApplicationCard";
import { SkeletonGhostCard } from "./loading";
import { STATUS_ICONS as STATUS_ICONS_MAP } from "./status-icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Applications loaded per page per section; more are fetched on scroll. */
export const SECTION_PAGE_SIZE = 50;

/** Section order on the dashboard (empty sections are hidden). */
export const SECTION_ORDER: DisplayStatus[] = [
  "offer",
  "interviewing",
  "applied",
  "ghosted",
  "rejected",
  "archived",
];

export const SECTION_TITLES: Record<DisplayStatus, string> = {
  offer: "Offers",
  interviewing: "Interviewing",
  applied: "Applied",
  ghosted: "Ghosted",
  rejected: "Rejected",
  archived: "Archived",
};

export function ApplicationSection({
  status,
  search,
  sort,
  collapsed,
  onToggle,
  onTotalChange,
}: {
  status: DisplayStatus;
  search: string;
  sort: "company" | "updated_at" | "progress";
  collapsed: boolean;
  onToggle: () => void;
  onTotalChange: (status: DisplayStatus, total: number) => void;
}) {
  const [items, setItems] = useState<ApplicationListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtersKey = JSON.stringify({ search, sort });
  // Start empty so the first data run always takes the "filters changed →
  // fresh start" branch (which sets totalPages/page from the server).
  const lastKeyRef = useRef("");
  const pageRef = useRef(1);
  const totalPagesRef = useRef(1);
  const loadingMoreRef = useRef(false);
  const reportedRef = useRef<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<() => void>(() => {});

  const { data, isPending, isFetching, isPlaceholderData, error: queryError } =
    useQuery({
      queryKey: ["applications", "section", status, { search, sort }],
      queryFn: () =>
        getApplications({
          status,
          search: search || undefined,
          sort,
          page: 1,
          limit: SECTION_PAGE_SIZE,
        }),
      placeholderData: (prev) => prev,
    });

  // Merge fresh page-1 data into the accumulated list.
  useEffect(() => {
    if (!data || isPlaceholderData) return;
    setError(null);
    if (lastKeyRef.current !== filtersKey) {      // Filters changed → start over with the new first page.
      lastKeyRef.current = filtersKey;
      setItems(data.data);
      pageRef.current = 1;
      setPage(1);
      totalPagesRef.current = data.pagination.totalPages;
      setTotalPages(data.pagination.totalPages);
    } else {
      // Same filters refetched (e.g. after a mutation) → refresh page 1 in
      // place so already-loaded pages further down stay put.
      setItems((prev) => {
        const next = [...prev];
        for (let i = 0; i < data.data.length && i < SECTION_PAGE_SIZE; i++) {
          next[i] = data.data[i];
        }
        return next;
      });
    }
    if (reportedRef.current !== data.pagination.total) {
      reportedRef.current = data.pagination.total;
      onTotalChange(status, data.pagination.total);
    }
  }, [data, isPlaceholderData, filtersKey, status, onTotalChange]);

  // Surface first-page fetch errors inside the section.
  useEffect(() => {
    if (queryError) setError((queryError as Error).message);
  }, [queryError]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;
    if (pageRef.current >= totalPagesRef.current) return;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const next = pageRef.current + 1;
      const res = await getApplications({
        status,
        search: search || undefined,
        sort,
        page: next,
        limit: SECTION_PAGE_SIZE,
      });
      setItems((prev) => [...prev, ...res.data]);
      pageRef.current = next;
      setPage(next);
      totalPagesRef.current = res.pagination.totalPages;
      setTotalPages(res.pagination.totalPages);
    } catch {
      // Transient — the sentinel/button will retry on the next scroll.
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [status, search, sort]);

  loadMoreRef.current = loadMore;

  const canLoadMore = page < totalPages;
  const total = data?.pagination.total ?? items.length;

  // Auto-load when this section's sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !canLoadMore || collapsed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreRef.current();
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [canLoadMore, collapsed]);

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
        {SECTION_TITLES[status]}
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

      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}

      {!collapsed && (
        <ul className="space-y-2">
          {items.map((app) => (
            <ApplicationCard key={app.id} app={app} />
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
