"use client";

import { useState } from "react";
import Link from "next/link";
import type { ApplicationListItem } from "@/lib/api";
import type { ApplicationStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { ApplicationCardView } from "./ApplicationCard";
import { MoveToMenu } from "./MoveToMenu";

/** Drag payload key — namespaced so nothing else can be mistaken for a card. */
export const DRAG_MIME = "application/x-ghosted-application";

/**
 * A card inside a kanban column: draggable with the native HTML5 API (no drag
 * library), plus a "Move to" menu so the same move works on touch, from the
 * keyboard, and for anyone who does not discover drag and drop.
 */
export function KanbanCard({
  app,
  onMove,
}: {
  app: ApplicationListItem;
  /** Column supplies the source status; the card only knows the target. */
  onMove: (id: string, to: ApplicationStatus, company: string) => void;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <div
      draggable
      onDragStart={(e) => {
        // "<company>\u0000<id>\u0000<from>": the receiving column needs the
        // source status to tell a step back from ordinary progress, and the
        // company name for the step-back dialog.
        e.dataTransfer.setData(
          DRAG_MIME,
          `${app.company}\u0000${app.id}\u0000${app.displayStatus}`,
        );
        e.dataTransfer.setData("text/plain", app.company);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      data-testid={`kanban-card-${app.id}`}
      className={cn(
        "group relative cursor-grab active:cursor-grabbing",
        dragging && "opacity-40",
      )}
    >
      {/* draggable={false}: the wrapper owns the drag, and a native link drag
          would otherwise hijack it (clicks still work). */}
      <Link href={`/applications/${app.id}`} className="block" draggable={false}>
        <ApplicationCardView app={app} compact reserveActions />
      </Link>

      <MoveToMenu
        app={app}
        onMove={onMove}
        // The same rule as the list card's kebab: centred on the progress bar it
        // reserves room from. A compact card is p-3 here, plus the 1px card
        // border, so its bar's centre is 21px above the bottom edge and a 28px
        // trigger needs 21 - 14. The column stacks, which puts the bar on the
        // card's last line whatever the round or date above it says.
        className="absolute bottom-[7px] right-1.5"
      />
    </div>
  );
}
