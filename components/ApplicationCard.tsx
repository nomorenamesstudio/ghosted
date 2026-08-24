"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
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
  "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" | "muted"
> = {
  applied: "outline",
  interviewing: "warning",
  offer: "success",
  rejected: "destructive",
  archived: "muted",
  ghosted: "info",
};

/** Muted, soft card-border accents for selected statuses. */
const STATUS_BORDER: Partial<Record<DisplayStatus, string>> = {
  offer:
    "border-emerald-300/70 hover:border-emerald-400/70 dark:border-emerald-800/60 dark:hover:border-emerald-700/60",
  rejected:
    "border-red-300/70 hover:border-red-400/70 dark:border-red-900/60 dark:hover:border-red-800/60",
  ghosted:
    "border-sky-300/70 hover:border-sky-400/70 dark:border-sky-800/60 dark:hover:border-sky-700/60",
};

export function ApplicationCard({ app }: { app: ApplicationListItem }) {
  const status = app.displayStatus;
  return (
    <li>
      <Link href={`/applications/${app.id}`} className="block">
        <Card
          className={cn(
            "transition-colors hover:border-primary/50",
            STATUS_BORDER[status],
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
                <Badge
                  variant={STATUS_VARIANT[status]}
                  className="gap-1 capitalize"
                >
                  <StatusIcon status={status} className="h-3 w-3" />
                  {status}
                </Badge>
                {app.currentRound && (
                  <span>
                    Round: {app.currentRound}
                  </span>
                )}
                <span>Updated {formatDistanceToNow(new Date(app.updatedAt), { addSuffix: true })}</span>
              </div>
            </div>
            <div className="flex w-32 shrink-0 flex-col items-end gap-1">
              <span className="text-xs font-semibold tabular-nums">
                {app.progress}%
              </span>
              <Progress value={app.progress} className="w-full" />
            </div>
          </CardContent>
        </Card>
      </Link>
    </li>
  );
}
