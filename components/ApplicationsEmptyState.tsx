"use client";

import { Ghost, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown when nothing is on screen — once for the whole board/list. Shared so the
 * kanban view and the list view cannot drift apart.
 *
 * The wording is a prop because the two views mean slightly different things by
 * "nothing": the board's columns cover every status, so empty there means no
 * applications at all, while the list keeps the archived section below this one,
 * so empty there means nothing *active*.
 */
export function ApplicationsEmptyState({
  filtered,
  onAdd,
  title = "No applications yet",
  cta = "Add your first application",
}: {
  filtered: boolean;
  onAdd: () => void;
  title?: string;
  cta?: string;
}) {
  if (filtered) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        No applications match your filters.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center">
      <Ghost className="h-14 w-14 text-violet-300" aria-hidden />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          Ghosted is here to keep every application, interview and offer in one
          place - so nothing ever gets ghosted. Add your first one and start the
          hunt! 🎯
        </p>
      </div>
      <Button data-testid="add-first-application" onClick={onAdd}>
        <Plus />
        {cta}
      </Button>
    </div>
  );
}
