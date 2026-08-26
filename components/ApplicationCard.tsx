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
  applied: "bg-sky-50/70 dark:bg-sky-950/20",
  interviewing: "bg-amber-50/70 dark:bg-amber-950/20",
  offer: "bg-emerald-50/70 dark:bg-emerald-950/20",
  rejected: "bg-red-50/70 dark:bg-red-950/20",
  ghosted: "bg-violet-50/70 dark:bg-violet-950/20",
  archived: "bg-muted/50 dark:bg-muted/20",
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

/**
 * The card visuals, without the list/link wrapper — shared by the real
 * dashboard card and the landing-page product mock.
 */
export function ApplicationCardView({
  app,
  className,
}: {
  app: ApplicationListItem;
  className?: string;
}) {
  const status = app.displayStatus;
  return (
    <Card
      className={cn(
        "transition-colors",
        STATUS_TINT[status],
        STATUS_BORDER[status],
        className,
      )}
    >
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{app.company}</span>
            <span className="truncate text-sm text-muted-foreground">
              {app.role}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {app.isFavorite && (
              <Star
                className="h-3.5 w-3.5 fill-amber-400 text-amber-500"
                aria-hidden
              />
            )}
            <Badge
              variant={STATUS_VARIANT[status]}
              className="gap-1 capitalize"
            >
              <StatusIcon status={status} className="h-3 w-3" />
              {status}
            </Badge>
            {app.currentRound && (
              <span>
                Last round: {app.currentRound}
              </span>
            )}
            <span>Updated {formatDistanceToNow(new Date(app.updatedAt), { addSuffix: true })}</span>
          </div>
        </div>
        <div className="flex w-32 shrink-0 flex-col items-end gap-1">
          <span className="text-xs font-semibold tabular-nums">
            {app.progress}%
          </span>
          <Progress
            value={app.progress}
            aria-label="Application progress"
            className="w-full"
          />
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
