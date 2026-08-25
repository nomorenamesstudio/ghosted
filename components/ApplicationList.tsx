"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Plus, Search } from "lucide-react";
import { getApplications, type ApplicationListItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DisplayStatus } from "@/lib/utils/status";
import { ApplicationCard } from "./ApplicationCard";
import { AddApplicationModal } from "./AddApplicationModal";
import { STATUS_ICONS as STATUS_ICONS_MAP, StatusIcon } from "./status-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Section order on the dashboard (empty sections are hidden). */
const SECTION_ORDER: DisplayStatus[] = [
  "offer",
  "interviewing",
  "applied",
  "ghosted",
  "rejected",
  "archived",
];

const SECTION_TITLES: Record<DisplayStatus, string> = {
  offer: "Offers",
  interviewing: "Interviewing",
  applied: "Applied",
  ghosted: "Ghosted",
  rejected: "Rejected",
  archived: "Archived",
};

const ALL = "__all__";
const COLLAPSED_KEY = "ghosted-collapsed-sections";

export function ApplicationList() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<"" | DisplayStatus>("");
  const [sort, setSort] = useState<"company" | "updated_at">("updated_at");
  const [addOpen, setAddOpen] = useState(false);

  // Collapsed sections (persisted per browser).
  const [collapsed, setCollapsed] = useState<Set<DisplayStatus>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY);
      return raw ? new Set(JSON.parse(raw) as DisplayStatus[]) : new Set();
    } catch {
      return new Set();
    }
  });

  function toggleSection(s: DisplayStatus) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(Array.from(next)));
      } catch {
        /* ignore storage errors */
      }
      return next;
    });
  }

  // Debounce search input (300ms).
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isPending, isError, error, isFetching } = useQuery({
    queryKey: ["applications", { search: debouncedSearch, status, sort }],
    queryFn: () =>
      getApplications({
        search: debouncedSearch || undefined,
        status: status || undefined,
        sort,
        limit: 100,
      }),
    placeholderData: (prev) => prev,
  });

  const apps = data?.data ?? [];

  const byStatus = new Map<DisplayStatus, ApplicationListItem[]>();
  for (const app of apps) {
    const list = byStatus.get(app.displayStatus) ?? [];
    list.push(app);
    byStatus.set(app.displayStatus, list);
  }
  const visibleSections = SECTION_ORDER.filter(
    (s) => (byStatus.get(s)?.length ?? 0) > 0,
  );
  const hasActiveFilters = Boolean(debouncedSearch || status);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search company or role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Search applications"
          />
        </div>
        <div className="flex flex-1 items-center gap-2">
          <Select
            value={status || ALL}
            onValueChange={(v) => setStatus(v === ALL ? "" : (v as DisplayStatus))}
          >
            <SelectTrigger className="w-[170px]" aria-label="Filter by status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {SECTION_ORDER.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  <StatusIcon status={s} className="mr-2 h-4 w-4" />
                  {SECTION_TITLES[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
            <SelectTrigger className="w-[160px]" aria-label="Sort applications">
              <SelectValue placeholder="Last updated" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated_at">Last updated</SelectItem>
              <SelectItem value="company">Company name</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            data-testid="add-application-fab"
            className="ml-auto"
            onClick={() => setAddOpen(true)}
          >
            <Plus />
            Add application
          </Button>
        </div>
      </div>

      {isFetching && (
        <p className="text-xs text-muted-foreground" data-testid="list-loading">
          Refreshing…
        </p>
      )}

      {isError && (
        <p role="alert" className="text-sm text-destructive">
          {(error as Error).message}
        </p>
      )}

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border bg-muted/40"
            />
          ))}
        </div>
      ) : visibleSections.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {hasActiveFilters
            ? "No applications match your filters."
            : "No applications yet — tap Add to create your first one."}
        </div>
      ) : (
        <div className="space-y-6" data-testid="application-sections">
          {visibleSections.map((s) => {
            const items = byStatus.get(s) ?? [];
            const Icon = STATUS_ICONS_MAP[s];
            const isCollapsed = collapsed.has(s);
            return (
              <section key={s} data-testid={`section-${s}`}>
                <button
                  type="button"
                  onClick={() => toggleSection(s)}
                  aria-expanded={!isCollapsed}
                  className="mb-2 flex w-full items-center gap-2 rounded-md text-left text-sm font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <Icon className="h-4 w-4" />
                  {SECTION_TITLES[s]}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
                    {items.length}
                  </span>
                  <ChevronDown
                    className={cn(
                      "ml-auto h-4 w-4 transition-transform",
                      isCollapsed && "-rotate-90",
                    )}
                    aria-hidden
                  />
                </button>
                {!isCollapsed && (
                  <ul className="space-y-2">
                    {items.map((app) => (
                      <ApplicationCard key={app.id} app={app} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <AddApplicationModal open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
