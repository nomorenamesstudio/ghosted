"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreVertical } from "lucide-react";
import type { ApplicationListItem } from "@/lib/api";
import type { ApplicationStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { ApplicationCardView } from "./ApplicationCard";
import { STATUS_TITLES } from "@/lib/utils/status";
import { StatusIcon } from "./status-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Drag payload key — namespaced so nothing else can be mistaken for a card. */
export const DRAG_MIME = "application/x-ghosted-application";

/** Statuses a card can be moved to. "ghosted" is derived, never set. */
export const MOVE_TARGETS: ApplicationStatus[] = [
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "archived",
];

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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Move ${app.company} to another status`}
            className="absolute bottom-1.5 right-1.5 h-7 w-7 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {MOVE_TARGETS.filter((s) => s !== app.status).map((s) => (
            <DropdownMenuItem
              key={s}
              onSelect={() => onMove(app.id, s, app.company)}
            >
              <StatusIcon status={s} className="mr-2 h-4 w-4" />
              {STATUS_TITLES[s]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
