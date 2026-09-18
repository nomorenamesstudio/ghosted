"use client";

import { useState } from "react";
import type { ApplicationListItem } from "@/lib/api";
import type { ApplicationStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import type { DisplayStatus } from "@/lib/utils/status";
import { STATUS_TITLES } from "@/lib/utils/status";
import { DRAG_MIME, KanbanCard } from "./KanbanCard";
import { SkeletonGhostCard } from "./loading";
import { STATUS_ICONS as STATUS_ICONS_MAP } from "./status-icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown } from "lucide-react";
import {
  useApplicationSection,
  type SectionSort,
} from "./use-application-section";

/**
 * One status column. Droppable with the native HTML5 API; the "ghosted" column
 * is not, because that status is derived from inactivity rather than chosen.
 */
export function KanbanColumn({
  status,
  search,
  sort,
  patienceDays,
  onMove,
  onTotalChange,
}: {
  status: DisplayStatus;
  search: string;
  sort: SectionSort;
  /** Days of silence before this column picks an application up. */
  patienceDays: number;
  /** `from` is this column — the board needs it to spot a step back. */
  onMove: (
    id: string,
    from: DisplayStatus,
    to: ApplicationStatus,
    company: string,
  ) => void;
  onTotalChange: (status: DisplayStatus, total: number) => void;
}) {
  const [over, setOver] = useState(false);
  const droppable = status !== "ghosted";

  const {
    items,
    total,
    isPending,
    error,
    canLoadMore,
    isLoadingMore,
    loadMore,
    sentinelRef,
  } = useApplicationSection({ status, search, sort, onTotalChange });

  const Icon = STATUS_ICONS_MAP[status];

  function handleDrop(e: React.DragEvent<HTMLElement>) {
    if (!droppable) return;
    e.preventDefault();
    setOver(false);
    const payload = e.dataTransfer.getData(DRAG_MIME);
    if (!payload) return;
    // "<company>\u0000<id>\u0000<from>" — the source status comes with the
    // card, because it is what tells a step back from ordinary progress.
    const [company, id, from] = payload.split("\u0000");
    if (!id || !from) return;
    onMove(id, from as DisplayStatus, status as ApplicationStatus, company);
  }

  return (
    <section
      data-testid={`kanban-column-${status}`}
      onDragOver={(e) => {
        if (!droppable) return;
        // Without preventDefault the drop never fires.
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => {
        // dragleave also fires when moving onto a child — ignore those.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setOver(false);
      }}
      onDrop={handleDrop}
      className={cn(
        // White in light mode (surfaces read against the grey page), with the
        // same subtle lift over the page in dark mode. 300px is a floor, not a
        // fixed width: with room to spare the columns share it evenly and fill
        // the window, and when there is not enough (six of them on a laptop)
        // the board scrolls instead of squashing.
        "flex min-w-[300px] flex-1 snap-start flex-col rounded-xl border bg-card transition-colors dark:bg-muted/20",
        over && droppable && "border-violet-400/70 bg-violet-100/40 dark:bg-violet-950/40",
      )}
    >
      <header className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4" />
        {STATUS_TITLES[status]}
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
          {total}
        </span>
        {status === "ghosted" && (
          <span className="ml-auto text-[10px] font-normal normal-case">
            auto · silent for {patienceDays} days
          </span>
        )}
      </header>

      {error && <p className="px-3 pt-2 text-sm text-destructive-readable">{error}</p>}

      <div className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
        {isPending && items.length === 0 ? (
          <>
            <Skeleton className="h-4 w-24" />
            <SkeletonGhostCard />
          </>
        ) : items.length === 0 ? (
          <p
            className={cn(
              // Top of the column, not centred: a 10-card column elsewhere used
              // to leave this floating in the middle of nothing.
              "rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground",
              over && droppable && "border-violet-400/70 text-foreground",
            )}
          >
            {droppable ? "Drop an application here" : "Nothing has gone quiet"}
          </p>
        ) : (
          items.map((app: ApplicationListItem) => (
            <KanbanCard
              key={app.id}
              app={app}
              onMove={(id, to, company) => onMove(id, status, to, company)}
            />
          ))
        )}

        {canLoadMore && (
          <div ref={sentinelRef} className="pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={loadMore}
              disabled={isLoadingMore}
            >
              <ChevronDown className="h-4 w-4" />
              {isLoadingMore ? "Loading…" : `Load more (${total - items.length})`}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
