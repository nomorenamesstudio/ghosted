"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Search } from "lucide-react";
import { STATUS_ORDER, STATUS_TITLES, type DisplayStatus } from "@/lib/utils/status";
import { AddApplicationModal } from "./AddApplicationModal";
import { VerificationModal } from "./VerificationModal";
import { ApplicationSection } from "./ApplicationSection";
import { ViewToggle } from "./ViewToggle";
import { ApplicationsEmptyState } from "./ApplicationsEmptyState";
import { KanbanBoard } from "./KanbanBoard";
import { GhostPulse } from "./loading";
import { StatusIcon } from "./status-icons";
import { useAccountIsEmpty } from "./use-account-is-empty";
import { useBoardSeed } from "./use-board-seed";
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

export type ViewMode = "list" | "board";

/** Hairline between the control groups when they live in the header. */
function Divider() {
  return <span aria-hidden className="h-6 w-px shrink-0 bg-border" />;
}

export function ApplicationList({
  status,
  onStatusChange,
  view,
  onViewChange,
  emailVerified,
  applicationCount,
  unverifiedAppLimit,
  patienceDays,
}: {
  status: "" | DisplayStatus;
  onStatusChange: (s: "" | DisplayStatus) => void;
  /** Owned by Dashboard: it also decides the page width and the stat cards. */
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  emailVerified: boolean;
  applicationCount: number;
  unverifiedAppLimit: number;
  patienceDays: number;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<"updated_at" | "company" | "progress">(
    "updated_at",
  );
  const [addOpen, setAddOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);

  // Unverified accounts are capped at unverifiedAppLimit applications. When
  // the cap is reached the add button opens the verification modal instead of
  // the form (the server enforces the cap too - this is purely UX).
  const atAppLimit = !emailVerified && applicationCount >= unverifiedAppLimit;

  // An account with nothing in it gets no toolbar: search, sort, the view
  // switch and "Add application" all have nothing to act on, and the empty
  // state below already carries the one action that matters. The same rule
  // keeps the verification banner away - see useAccountIsEmpty.
  const accountIsEmpty = useAccountIsEmpty(applicationCount);

  // Every section's first page arrives in one request instead of one per
  // section. Disabled when a single status is filtered in: then the per-status
  // request is already the cheap one and there is nothing to consolidate.
  const { seedReady } = useBoardSeed({
    search: debouncedSearch,
    sort,
    enabled: !status,
  });

  function handleAddClick() {
    if (atAppLimit) setVerifyOpen(true);
    else setAddOpen(true);
  }

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
    : STATUS_ORDER.filter((s) => s !== "archived");

  const allKnown = renderedStatuses.every(
    (s) => typeof totals[s] === "number",
  );
  const allEmpty =
    allKnown && renderedStatuses.every((s) => (totals[s] ?? 0) === 0);
  const hasActiveFilters = Boolean(debouncedSearch || status);

  // Board controls move into the app header on a wide screen: they are then
  // always in reach (the header is sticky) and the columns get the whole width
  // below it. Below the breakpoint - and in list view - they keep their own row.
  //
  // Both facts are only knowable in the browser, so the toolbar is not rendered
  // until they are: rendering it inline first and moving it into the header a
  // hydration later made the search, sort and add controls visibly jump up the
  // page (measured: mounted inline, then remounted in the header ~460ms in).
  // Until then the space is left to the skeletons.
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const [isWideScreen, setIsWideScreen] = useState(false);
  const [placementKnown, setPlacementKnown] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1280px)");
    const update = () => setIsWideScreen(query.matches);
    update();
    query.addEventListener("change", update);
    setPlacementKnown(true);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setHeaderSlot(document.getElementById("dashboard-header-slot"));
  }, []);

  const controlsInHeader =
    view === "board" && isWideScreen && headerSlot !== null;

  const toolbar = (
      <div
        className={
          // One branch or the other, never merged: `flex-col` and `flex-row`
          // both present let CSS order decide, which stacked the header row.
          controlsInHeader
            ? "flex items-center gap-2"
            : "flex flex-col gap-2 sm:flex-row sm:items-center"
        }
      >
        <div
          className={
            controlsInHeader
              ? "relative w-[300px] flex-none"
              : "relative sm:max-w-xs sm:flex-1"
          }
        >
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
          {/* No status filter on the board: the columns *are* the statuses. */}
          {view === "list" && (
            <Select
              value={status || ALL}
              onValueChange={(v) =>
                onStatusChange(v === ALL ? "" : (v as DisplayStatus))
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
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    <StatusIcon status={s} className="mr-2 h-4 w-4" />
                    {STATUS_TITLES[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
          <ViewToggle view={view} onChange={onViewChange} />
          {/* Header placement groups the controls: search/sort/view, then the
              action, then the account menu — separated by hairlines. */}
          {controlsInHeader && <Divider />}
          <Button
            size="sm"
            data-testid="add-application-fab"
            className={
              controlsInHeader
                ? "w-auto"
                : "w-full sm:ml-auto sm:w-auto"
            }
            onClick={handleAddClick}
          >
            <Plus />
            Add application
          </Button>
          {controlsInHeader && <Divider />}
        </div>
      </div>
  );

  return (
    <div className="space-y-4">
      {/* Hidden entirely while the account is empty - the empty state below is
          the whole screen's worth of interface in that case - and not rendered
          until its placement is known, so it can never appear in one place and
          move to another. */}
      {!accountIsEmpty &&
        placementKnown &&
        (controlsInHeader ? createPortal(toolbar, headerSlot) : toolbar)}

      {view === "board" ? (
        <KanbanBoard
          search={debouncedSearch}
          sort={sort}
          onAdd={handleAddClick}
          patienceDays={patienceDays}
        />
      ) : (
        <div className="space-y-6" data-testid="application-sections">
          {!allKnown && <GhostPulse />}
          {renderedStatuses.map((s) => (
            <ApplicationSection
              key={s}
              status={s}
              search={debouncedSearch}
              sort={sort}
              seedReady={seedReady}
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
          {allEmpty && (
            <ApplicationsEmptyState
              filtered={hasActiveFilters}
              onAdd={handleAddClick}
            />
          )}
        </div>
      )}

      <AddApplicationModal open={addOpen} onOpenChange={setAddOpen} />
      <VerificationModal
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        limit={unverifiedAppLimit}
      />
    </div>
  );
}
