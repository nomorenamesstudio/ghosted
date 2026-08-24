"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import type { ApplicationListItem } from "@/lib/api";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { StatusIcon } from "./status-icons";

const STATUS_VARIANT: Record<
  ApplicationListItem["status"],
  "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" | "muted"
> = {
  applied: "info",
  interviewing: "warning",
  offer: "success",
  rejected: "destructive",
  archived: "muted",
};

export function ApplicationCard({ app }: { app: ApplicationListItem }) {
  return (
    <li>
      <Link href={`/applications/${app.id}`} className="block">
        <Card className="transition-colors hover:border-primary/50">
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
                  variant={STATUS_VARIANT[app.status]}
                  className="gap-1 capitalize"
                >
                  <StatusIcon status={app.status} className="h-3 w-3" />
                  {app.status}
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
