"use client";

import { MoreVertical } from "lucide-react";
import type { ApplicationListItem } from "@/lib/api";
import type { ApplicationStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
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

/** Statuses a card can be moved to. "ghosted" is derived, never set. */
export const MOVE_TARGETS: ApplicationStatus[] = [
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "archived",
];

/**
 * The "Move to" kebab: a status change that works on touch, from the keyboard,
 * and for anyone who does not discover drag and drop.
 *
 * Shared by the board card (where it is the non-drag route to a move) and the
 * list card (where it is the only one), so both offer the same targets in the
 * same order and cannot drift apart.
 *
 * It owns no mutation and no positioning: the caller supplies `onMove` and,
 * through `className`, the corner the trigger sits in — the card is the
 * positioning context, and the list card and the kanban card reserve different
 * amounts of space for it.
 */
export function MoveToMenu({
  app,
  onMove,
  className,
}: {
  app: ApplicationListItem;
  /** The card supplies the company; the view supplies the source status. */
  onMove: (id: string, to: ApplicationStatus, company: string) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Move ${app.company} to another status`}
          className={cn(
            "h-7 w-7 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100",
            className,
          )}
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
  );
}
