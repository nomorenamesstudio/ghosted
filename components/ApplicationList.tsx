"use client";

import { useCallback, useEffect, useState } from "react";
import { Ghost, Plus, Search } from "lucide-react";
import type { DisplayStatus } from "@/lib/utils/status";
import { AddApplicationModal } from "./AddApplicationModal";
import { ApplicationSection, SECTION_ORDER, SECTION_TITLES } from "./ApplicationSection";
import { GhostPulse } from "./loading";
import { StatusIcon } from "./status-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";
const COLLAPSED_KEY = "ghosted-collapsed-sections";

export function ApplicationList() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<"" | DisplayStatus>("");
  const [sort, setSort] = useState<"updated_at" | "company" | "progress">(
    "updated_at",
  );
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

  // Totals per section so the global empty state can be shown once every
  // section has reported in.
  const [totals, setTotals] = useState<Partial<Record<DisplayStatus, number>>>(
    {},
  );
  const reportTotal = useCallback((s: DisplayStatus, total: number) => {
    setTotals((prev) => (prev[s] === total ? prev : { ...prev, [s]: total }));
  }, []);

  // The archived section only renders when explicitly filtered.
  const renderedStatuses = status
    ? [status]
    : SECTION_ORDER.filter((s) => s !== "archived");

  const allKnown = renderedStatuses.every(
    (s) => typeof totals[s] === "number",
  );
  const allEmpty =
    allKnown && renderedStatuses.every((s) => (totals[s] ?? 0) === 0);
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
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Select
            value={status || ALL}
            onValueChange={(v) =>
              setStatus(v === ALL ? "" : (v as DisplayStatus))
            }
          >
            <SelectTrigger
              className="min-w-0 flex-1 sm:w-[170px] sm:flex-none"
              aria-label="Filter by status"
            >
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
            <SelectTrigger
              className="min-w-0 flex-1 sm:w-[160px] sm:flex-none"
              aria-label="Sort applications"
            >
              <SelectValue placeholder="Last updated" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated_at">Last updated</SelectItem>
              <SelectItem value="company">Company name</SelectItem>
              <SelectItem value="progress">Progress</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            data-testid="add-application-fab"
            className="w-full sm:ml-auto sm:w-auto"
            onClick={() => setAddOpen(true)}
          >
            <Plus />
            Add application
          </Button>
        </div>
      </div>

      <div className="space-y-6" data-testid="application-sections">
        {!allKnown && <GhostPulse />}
        {renderedStatuses.map((s) => (
          <ApplicationSection
            key={s}
            status={s}
            search={debouncedSearch}
            sort={sort}
            // While a status filter is active the single visible section is
            // forced open, and toggling is disabled so the persisted manual
            // collapse state survives until the filter is cleared again.
            collapsed={status ? false : collapsed.has(s)}
            onToggle={status ? () => {} : () => toggleSection(s)}
            onTotalChange={reportTotal}
          />
        ))}
        {/* Sections stay mounted (even when empty) so their queries stay
            alive and mutations can surface new applications. */}
        {allEmpty &&
          (hasActiveFilters ? (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              No applications match your filters.
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center">
              <Ghost className="h-14 w-14 text-violet-300" aria-hidden />
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">No applications yet</h2>
                <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                  Ghosted is here to keep every application, interview and
                  offer in one place — so nothing ever gets ghosted. Add your
                  first one and start the hunt! 🎯
                </p>
              </div>
              <Button onClick={() => setAddOpen(true)}>
                <Plus />
                Add your first application
              </Button>
            </div>
          ))}
      </div>

      <AddApplicationModal open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
