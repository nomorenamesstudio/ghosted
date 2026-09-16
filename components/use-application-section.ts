"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getApplications, type ApplicationListItem } from "@/lib/api";
import type { DisplayStatus } from "@/lib/utils/status";

/** Applications loaded per page per status group; more are fetched on scroll. */
export const SECTION_PAGE_SIZE = 50;

export type SectionSort = "company" | "updated_at" | "progress";

/**
 * One status group's applications, with infinite scroll.
 *
 * Shared by the list sections and the kanban columns on purpose: both views use
 * the same query key, so they page, cache, invalidate and re-render identically
 * and switching views never refetches what is already on screen.
 */
export function useApplicationSection({
  status,
  search,
  sort,
  collapsed = false,
  onTotalChange,
}: {
  status: DisplayStatus;
  search: string;
  sort: SectionSort;
  /** Collapsed sections/columns skip the scroll sentinel (nothing to load into). */
  collapsed?: boolean;
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
      // place so already-loaded pages further down stay put. The tail is
      // truncated to what the server still reports: when an application moves
      // out of this group, keeping the old tail would leave a duplicate behind
      // and keep showing a card the server no longer returns here.
      setItems((prev) => {
        const firstPage = data.data;
        const keep = Math.max(0, data.pagination.total - firstPage.length);
        const merged = [
          ...firstPage,
          ...prev.slice(SECTION_PAGE_SIZE, SECTION_PAGE_SIZE + keep),
        ];
        // Return the same array when nothing actually changed: this effect can
        // re-run for unrelated reasons, and a fresh reference every time would
        // re-render forever with a caller that passes an inline callback.
        const unchanged =
          merged.length === prev.length &&
          merged.every((a, i) => a.id === prev[i]?.id);
        return unchanged ? prev : merged;
      });
    }
    if (reportedRef.current !== data.pagination.total) {
      reportedRef.current = data.pagination.total;
      onTotalChange(status, data.pagination.total);
    }
  }, [data, isPlaceholderData, filtersKey, status, onTotalChange]);

  // Surface first-page fetch errors inside the group.
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

  // Auto-load when the sentinel scrolls into view.
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

  return {
    items,
    total,
    isPending,
    isFetching,
    error,
    canLoadMore,
    isLoadingMore,
    loadMore,
    sentinelRef,
  };
}
