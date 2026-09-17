"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Star } from "lucide-react";
import type { ApplicationListItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CompanyAvatar } from "./CompanyAvatar";
import { Progress } from "@/components/ui/progress";
import { StatusIcon } from "./status-icons";
import type { DisplayStatus } from "@/lib/utils/status";

const STATUS_VARIANT: Record<
  DisplayStatus,
  "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" | "muted" | "violet"
> = {
  applied: "info",
  interviewing: "warning",
  offer: "success",
  rejected: "destructive",
  archived: "muted",
  ghosted: "violet",
};

/** Very light per-status background tint on the cards. */
const STATUS_TINT: Partial<Record<DisplayStatus, string>> = {
  applied: "bg-sky-100 dark:bg-sky-950/20",
  interviewing: "bg-amber-100 dark:bg-amber-950/20",
  offer: "bg-emerald-100 dark:bg-emerald-950/20",
  rejected: "bg-red-100 dark:bg-red-950/20",
  ghosted: "bg-violet-100 dark:bg-violet-950/20",
  archived: "bg-muted/60 dark:bg-muted/20",
};

/** Muted border matching each status color (pairs with the tint). */
const STATUS_BORDER: Partial<Record<DisplayStatus, string>> = {
  applied:
    "border-sky-300/70 hover:border-sky-400/70 dark:border-sky-800/60 dark:hover:border-sky-700/60",
  interviewing:
    "border-amber-300/70 hover:border-amber-400/70 dark:border-amber-800/60 dark:hover:border-amber-700/60",
  offer:
    "border-emerald-300/70 hover:border-emerald-400/70 dark:border-emerald-800/60 dark:hover:border-emerald-700/60",
  rejected:
    "border-red-300/70 hover:border-red-400/70 dark:border-red-900/60 dark:hover:border-red-800/60",
  ghosted:
    "border-violet-300/70 hover:border-violet-400/70 dark:border-violet-800/60 dark:hover:border-violet-700/60",
  archived:
    "border-zinc-300/70 hover:border-zinc-400/70 dark:border-zinc-700/60 dark:hover:border-zinc-600/60",
};

/** Progress bar colors harmonized with each status (track + fill). */
export const STATUS_PROGRESS: Record<
  DisplayStatus,
  { track: string; fill: string }
> = {
  applied: {
    track: "bg-sky-300 dark:bg-sky-900/50",
    fill: "bg-sky-500 dark:bg-sky-400",
  },
  interviewing: {
    track: "bg-amber-300 dark:bg-amber-900/50",
    fill: "bg-amber-500 dark:bg-amber-400",
  },
  offer: {
    track: "bg-emerald-300 dark:bg-emerald-900/50",
    fill: "bg-emerald-500 dark:bg-emerald-400",
  },
  rejected: {
    track: "bg-red-300 dark:bg-red-900/50",
    fill: "bg-red-500 dark:bg-red-400",
  },
  ghosted: {
    track: "bg-violet-300 dark:bg-violet-900/50",
    fill: "bg-violet-500 dark:bg-violet-400",
  },
  archived: {
    track: "bg-zinc-200/60 dark:bg-zinc-800/50",
    fill: "bg-zinc-400 dark:bg-zinc-500",
  },
};

/**
 * The card visuals, without the list/link wrapper — shared by the real
 * dashboard card and the landing-page product mock.
 *
 * `compact` drops the desktop one-line layout for the narrow kanban columns:
 * the viewport breakpoints in the default layout are no use inside a 300px
 * column, where the card must always stack.
 *
 * `reserveActions` leaves room at the end of the progress row for a control the
 * board floats there (its "Move to" menu), so the bar stops short of it instead
 * of running underneath.
 */
export function ApplicationCardView({
  app,
  className,
  compact = false,
  reserveActions = false,
}: {
  app: ApplicationListItem;
  className?: string;
  compact?: boolean;
  reserveActions?: boolean;
}) {
  const status = app.displayStatus;
  return (
    <Card
      className={cn(
        "card-sheen transition-colors",
        STATUS_TINT[status],
        STATUS_BORDER[status],
        className,
      )}
    >
      <CardContent
        className={cn("flex flex-col gap-3", compact ? "p-3" : "p-4")}
      >
        {/* Identity block: everything is indented past the logo, and the status
            badge is pinned to the card's top-right corner. */}
        <div className="flex min-w-0 items-start gap-2">
          <CompanyAvatar
            applicationId={app.id}
            company={app.company}
            version={app.updatedAt}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{app.company}</span>
              {app.isFavorite && (
                <Star
                  className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500"
                  aria-hidden
                />
              )}
              <Badge
                variant={STATUS_VARIANT[status]}
                className="ml-auto shrink-0 gap-1 capitalize"
              >
                <StatusIcon status={status} className="h-3 w-3" />
                {status}
              </Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground">{app.role}</p>
          </div>
        </div>

        {/* Hairline across the full card, then the dates and the progress:
            side by side on the wide list card, stacked in a kanban column. */}
        <div
          className={cn(
            "flex flex-col gap-2 border-t pt-2",
            !compact && "sm:flex-row sm:items-center sm:justify-between sm:gap-4",
          )}
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {app.currentRound && <span>Last round: {app.currentRound}</span>}
            <span>
              Updated {formatDistanceToNow(new Date(app.updatedAt), { addSuffix: true })}
            </span>
          </div>
          <div
            className={cn(
              "flex shrink-0 items-center gap-2",
              !compact ? "sm:w-48" : "w-full",
              reserveActions && "pr-9",
            )}
          >
            <span className="text-xs font-semibold tabular-nums">
              {app.progress}%
            </span>
            <Progress
              value={app.progress}
              aria-label="Application progress"
              segments={app.milestoneCount}
              className={cn("flex-1", STATUS_PROGRESS[status].track)}
              indicatorClassName={STATUS_PROGRESS[status].fill}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ApplicationCard({ app }: { app: ApplicationListItem }) {
  return (
    <li>
      <Link href={`/applications/${app.id}`} className="block">
        <ApplicationCardView app={app} />
      </Link>
    </li>
  );
}
