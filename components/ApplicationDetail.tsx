"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getApplication } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MilestoneTimeline } from "./MilestoneTimeline";
import { EditApplicationForm } from "./EditApplicationForm";
import type { ApplicationStatus } from "@/lib/db/schema";

export const STATUS_BADGE_VARIANT: Record<
  ApplicationStatus,
  "info" | "warning" | "success" | "destructive" | "muted"
> = {
  applied: "info",
  interviewing: "warning",
  offer: "success",
  rejected: "destructive",
  archived: "muted",
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <Badge data-testid="status-badge" variant={STATUS_BADGE_VARIANT[status]}>
      {status}
    </Badge>
  );
}

export function ApplicationDetail({ id }: { id: string }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["application", id],
    queryFn: () => getApplication(id),
  });

  if (isPending) {
    return (
      <div className="space-y-4 pt-6">
        <div className="h-10 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-56 animate-pulse rounded-xl border bg-muted/40" />
      </div>
    );
  }

  if (isError || !data?.data) {
    return (
      <div className="pt-6">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Back to dashboard
        </Link>
        <p role="alert" className="mt-4 text-destructive">
          {(error as Error).message}
        </p>
      </div>
    );
  }

  const app = data.data;

  return (
    <div className="space-y-6 pt-6">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Back to dashboard
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{app.company}</h1>
          <span className="text-lg text-muted-foreground">{app.role}</span>
          <StatusBadge status={app.status} />
        </div>
        <div className="mt-3 flex max-w-md items-center gap-3">
          <Progress value={app.progress} className="flex-1" />
          <span className="text-sm font-semibold tabular-nums">
            {app.progress}%
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <MilestoneTimeline
          appId={app.id}
          milestones={app.milestones}
        />
        <EditApplicationForm app={app} />
      </div>
    </div>
  );
}
