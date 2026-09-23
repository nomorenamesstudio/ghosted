"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addMilestone,
  resetTimeline,
  updateApplication,
  type ApplicationsResult,
} from "@/lib/api";
import type { ApplicationStatus } from "@/lib/db/schema";
import {
  BOARD_ORDER,
  STEP_BACK_TITLES,
  stepBackKind,
  type DisplayStatus,
} from "@/lib/utils/status";
import { ApplicationsEmptyState } from "./ApplicationsEmptyState";
import { KanbanColumn } from "./KanbanColumn";
import { StepBackDialog } from "./StepBackDialog";
import { GhostPulse } from "./loading";
import type { SectionSort } from "./use-application-section";

/** A move that was held back because it needs a decision first. */
interface PendingStepBack {
  id: string;
  company: string;
  from: DisplayStatus;
  to: ApplicationStatus;
}

/**
 * Board view: one column per status, drag a card to change its status.
 *
 * Differences from the list view, all deliberate: columns run in pipeline
 * order rather than by importance, every column renders even when empty (you
 * have to be able to drop into an empty status), `archived` is always shown so
 * cards can be filed away without leaving the board, "ghosted" accepts no
 * drops because that state is derived from inactivity, and the status filter
 * is absent because the columns *are* the statuses.
 */
export function KanbanBoard({
  search,
  sort,
  onAdd,
  patienceDays,
}: {
  search: string;
  sort: SectionSort;
  onAdd: () => void;
  patienceDays: number;
}) {
  const qc = useQueryClient();
  const [moveError, setMoveError] = useState<string | null>(null);
  const [pendingStepBack, setPendingStepBack] = useState<PendingStepBack | null>(
    null,
  );

  const columns = BOARD_ORDER;
  const hasActiveFilters = Boolean(search);

  // Column totals, so the global empty state can be shown once every column
  // has reported in (same contract as the list view's sections).
  const [totals, setTotals] = useState<Partial<Record<DisplayStatus, number>>>(
    {},
  );
  const reportTotal = useCallback((s: DisplayStatus, total: number) => {
    setTotals((prev) => (prev[s] === total ? prev : { ...prev, [s]: total }));
  }, []);
  const allKnown = columns.every((s) => typeof totals[s] === "number");
  const allEmpty = allKnown && columns.every((s) => (totals[s] ?? 0) === 0);

  // Optimistic removal from whichever column cached it: on a move the card
  // should leave immediately, and the invalidation below fills in the
  // destination column.
  //
  // `affected` is the set of sections the card was actually in — usually one,
  // but a stale application is displayed in both "applied" and "ghosted", and
  // those are the only sections that need to come back from the server.
  async function detachFromCaches(id: string) {
    await qc.cancelQueries({ queryKey: ["applications"] });
    const snapshots = qc.getQueriesData<ApplicationsResult>({
      queryKey: ["applications", "section"],
    });
    const affected: string[] = [];
    for (const [key, data] of snapshots) {
      if (!data || !data.data.some((a) => a.id === id)) continue;
      affected.push(String(key[2]));
      qc.setQueryData(key, {
        ...data,
        data: data.data.filter((a) => a.id !== id),
      });
    }
    return { snapshots, affected };
  }

  function restore(
    ctx:
      | { snapshots: ReturnType<typeof qc.getQueriesData<ApplicationsResult>> }
      | undefined,
  ) {
    ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
  }

  /**
   * Refresh every board section. Kept for the mutations whose effect on status
   * the client cannot predict: a step-back rewrites the timeline first and the
   * server re-derives the status from it, so any column can change.
   */
  function invalidateAll(id?: string) {
    qc.invalidateQueries({ queryKey: ["applications"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
    if (id) qc.invalidateQueries({ queryKey: ["application", id] });
  }

  /**
   * Refresh only the sections a mutation can actually have changed. Plain moves
   * know both ends of the change, and refetching the other four columns costs
   * four requests and a dozen queries per drag — the card cannot have appeared
   * in them.
   *
   * "applied" and "interviewing" drag the ghosted section with them: a stale
   * application of either status is displayed there too (see displayStatusOf),
   * so that column's contents change even though its status does not.
   */
  function invalidateSections(statuses: Iterable<string>, id?: string) {
    for (const status of Array.from(new Set(statuses))) {
      qc.invalidateQueries({ queryKey: ["applications", "section", status] });
    }
    qc.invalidateQueries({ queryKey: ["stats"] });
    if (id) qc.invalidateQueries({ queryKey: ["application", id] });
  }

  /** Plain status change - what a forward move and "leave it as is" both do. */
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ApplicationStatus }) =>
      updateApplication(id, { status }),
    onMutate: async ({ id }) => {
      setMoveError(null);
      return detachFromCaches(id);
    },
    onError: (err, _vars, ctx) => {
      restore(ctx);
      setMoveError((err as Error).message);
    },
    onSettled: (_data, _err, vars, ctx) => {
      invalidateSections(
        [
          // The sections the card was in before the move (from the optimistic
          // detach), then where it went.
          ...(ctx?.affected ?? []),
          vars.status,
          ...(vars.status === "applied" || vars.status === "interviewing"
            ? ["ghosted"]
            : []),
        ],
        vars.id,
      );
    },
  });

  /**
   * Confirmed step-back: rewrite the timeline first - append the round that
   * happened, or reset it when the process starts over - then move the card.
   * Both timeline calls re-derive the status, so the explicit status has to be
   * the last write.
   */
  const confirmStepBack = useMutation({
    mutationFn: async ({
      id,
      status,
      title,
      reset,
    }: {
      id: string;
      status: ApplicationStatus;
      title: string;
      reset: boolean;
    }) => {
      if (reset) await resetTimeline(id);
      else await addMilestone(id, { title });
      return updateApplication(id, { status });
    },
    onMutate: async ({ id }) => {
      setMoveError(null);
      return detachFromCaches(id);
    },
    onError: (err, _vars, ctx) => {
      restore(ctx);
      setMoveError((err as Error).message);
    },
    onSettled: (_data, _err, vars) => {
      invalidateAll(vars.id);
      setPendingStepBack(null);
    },
  });

  const handleMove = useCallback(
    (id: string, from: DisplayStatus, to: ApplicationStatus, company: string) => {
      if (stepBackKind(from, to)) {
        // Nothing is written yet: the card stays put until the user chooses.
        setPendingStepBack({ id, company, from, to });
        return;
      }
      move.mutate({ id, status: to });
    },
    [move],
  );

  /** Tertiary option: do the move, leave the timeline untouched. */
  const handleMoveAnyway = useCallback(() => {
    if (!pendingStepBack) return;
    move.mutate({ id: pendingStepBack.id, status: pendingStepBack.to });
    setPendingStepBack(null);
  }, [move, pendingStepBack]);

  const dialogKind = pendingStepBack
    ? stepBackKind(pendingStepBack.from, pendingStepBack.to)
    : null;

  return (
    <div className="space-y-2">
      {moveError && <p className="text-sm text-destructive-readable">{moveError}</p>}
      {!allKnown && <GhostPulse />}
      {/* The columns stay mounted even when every one of them is empty: they
          own the queries, so unmounting them (on a search that matches nothing)
          would leave nothing to refetch once the search is cleared - the board
          would be stuck on the empty state with no way back. Hidden, not
          removed. */}
      <div
        data-testid="kanban-board"
        className={cn(
          // `scroll-px-4` matches the padding: without it, snapping aligns the
          // first column to the padding *box* and the container auto-scrolls by
          // 16px on load, eating the left padding and leaving a gap on the right.
          "-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:scroll-px-0 sm:px-0",
          allEmpty && "hidden",
        )}
      >
        {columns.map((s) => (
          <KanbanColumn
            key={s}
            status={s}
            search={search}
            sort={sort}
            patienceDays={patienceDays}
            onMove={handleMove}
            onTotalChange={reportTotal}
          />
        ))}
      </div>
      {allEmpty && (
        <ApplicationsEmptyState filtered={hasActiveFilters} onAdd={onAdd} />
      )}

      <StepBackDialog
        kind={dialogKind === "reset" ? "reset" : "add-step"}
        company={pendingStepBack?.company ?? ""}
        from={pendingStepBack?.from ?? "offer"}
        to={pendingStepBack?.to ?? "interviewing"}
        defaultTitle={
          STEP_BACK_TITLES[pendingStepBack?.to ?? "interviewing"] ?? "New step"
        }
        open={pendingStepBack !== null && dialogKind !== null}
        isPending={confirmStepBack.isPending || move.isPending}
        error={confirmStepBack.isError ? (confirmStepBack.error as Error).message : null}
        onOpenChange={(open) => {
          // Cancel/dismiss → the move is simply abandoned.
          if (!open) setPendingStepBack(null);
        }}
        onMoveAnyway={handleMoveAnyway}
        onConfirm={(title) => {
          if (!pendingStepBack) return;
          confirmStepBack.mutate({
            id: pendingStepBack.id,
            status: pendingStepBack.to,
            title,
            reset: dialogKind === "reset",
          });
        }}
      />
    </div>
  );
}
