"use client";

import { Ghost, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown when nothing is on screen — once for the whole board/list. Shared so the
 * kanban view and the list view cannot drift apart.
 */
export function ApplicationsEmptyState({
  filtered,
  onAdd,
}: {
  filtered: boolean;
  onAdd: () => void;
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
        <h2 className="text-lg font-semibold">No applications yet</h2>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          Ghosted is here to keep every application, interview and offer in one
          place - so nothing ever gets ghosted. Add your first one and start the
          hunt! 🎯
        </p>
      </div>
      <Button onClick={onAdd}>
        <Plus />
        Add your first application
      </Button>
    </div>
  );
}
