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
import { DashboardLoading } from "./DashboardLoading";
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

  // Collapsed sections (persisted per browser). The archived section starts
  // closed — it is the one people go looking for rather than one they want in
  // front of them — so with nothing stored, it is the default.
  const [collapsed, setCollapsed] = useState<Set<DisplayStatus>>(() => {
    const closedByDefault = (): Set<DisplayStatus> =>
      new Set<DisplayStatus>(["archived"]);
    if (typeof window === "undefined") return new Set<DisplayStatus>();
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY);
      if (!raw) return closedByDefault();
      const parsed: unknown = JSON.parse(raw);
      // v2 wraps the list so that a preference stored before the archived
      // section existed (a bare array, with no opinion about it) can be told
      // apart from one the user has since made.
      if (Array.isArray(parsed)) {
        return new Set<DisplayStatus>([
          ...(parsed as DisplayStatus[]),
          "archived",
        ]);
      }
      return new Set<DisplayStatus>(
        ((parsed as { collapsed?: DisplayStatus[] }).collapsed ??
          []) as DisplayStatus[],
      );
    } catch {
      return closedByDefault();
    }
  });

  function toggleSection(s: DisplayStatus) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      try {
        localStorage.setItem(
          COLLAPSED_KEY,
          JSON.stringify({ v: 2, collapsed: Array.from(next) }),
        );
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

  // The archived section belongs to the list view now: it sits *below* the empty
  // state (archived applications are not "active", so their presence must not
  // suppress it) and starts closed, because it is the section people go looking
  // for rather than one they want in the way.
  const activeSections = status ? [status] : STATUS_ORDER.filter((s) => s !== "archived");
  const showArchived = !status;

  // Only the active sections decide the empty state: an account whose
  // applications are all archived still has nothing active to show.
  const allKnown = activeSections.every((s) => typeof totals[s] === "number");
  const allEmpty =
    allKnown && activeSections.every((s) => (totals[s] ?? 0) === 0);
  const hasActiveFilters = Boolean(debouncedSearch || status);
  const hasArchived = (totals.archived ?? 0) > 0;

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

  // Everything below the header waits for this. Which of the three shapes the
  // page takes — board, list, or the empty state — depends on data that only
  // exists in the browser (the stored view, the account's totals, the first pages
  // of each section), and drawing one of them before that is known is how the
  // dashboard ended up showing a search box, six empty columns and then
  // rearranging itself.
  //
  // The empty state waits too. It used to be let through early, on the grounds
  // that a zero application count is already known on the server — but "this
  // account is empty" is the *result* of this load, not an input to it, and
  // letting it through rendered the board over its own skeletons for a few
  // hundred milliseconds before the columns reported in and collapsed into the
  // empty state. The seed settles first now, then the sections read their seeded
  // (empty) pages and the empty state appears in one step.
  const ready = placementKnown && seedReady;

  if (!ready) return <DashboardLoading />;

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
          {activeSections.map((s) => (
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
              // Archived applications are not active, and the archived section
              // sits below this: "no active applications" is what is actually
              // true here, and the call to action stops claiming to be the
              // first one when there is already something archived.
              title="No active applications"
              cta={hasArchived ? "Add an application" : "Add your first application"}
            />
          )}
          {/* Last, and closed by default: archived applications are the ones
              being kept rather than worked on. */}
          {showArchived && (
            <ApplicationSection
              status="archived"
              search={debouncedSearch}
              sort={sort}
              seedReady={seedReady}
              collapsed={collapsed.has("archived")}
              onToggle={() => toggleSection("archived")}
              onTotalChange={reportTotal}
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
