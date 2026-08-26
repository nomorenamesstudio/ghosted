"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowLeft, MoreVertical, Pencil, RotateCcw, Star } from "lucide-react";
import {
  deleteApplication,
  getApplication,
  reopenApplication,
  toggleFavorite,
  type ApplicationDetail,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MilestoneTimeline } from "./MilestoneTimeline";
import { EditApplicationForm } from "./EditApplicationForm";
import { ConfirmDialog } from "./ConfirmDialog";
import { GhostPulse, SkeletonGhostCard } from "./loading";
import { StatusIcon } from "./status-icons";
import { Skeleton } from "@/components/ui/skeleton";
import type { DisplayStatus } from "@/lib/utils/status";

export const STATUS_BADGE_VARIANT: Record<
  DisplayStatus,
  | "info"
  | "warning"
  | "success"
  | "destructive"
  | "muted"
  | "outline"
  | "violet"
> = {
  applied: "info",
  interviewing: "warning",
  offer: "success",
  rejected: "destructive",
  archived: "muted",
  ghosted: "violet",
};

export function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <Badge
      data-testid="status-badge"
      variant={STATUS_BADGE_VARIANT[status]}
      className="gap-1 capitalize"
    >
      <StatusIcon status={status} className="h-3.5 w-3.5" />
      {status}
    </Badge>
  );
}

function scrollToForm() {
  document
    .getElementById("application-details")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function ApplicationDetail({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["application", id],
    queryFn: () => getApplication(id),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["application", id] });
    qc.invalidateQueries({ queryKey: ["applications"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  };

  /** Soft delete: archives the application. */
  const archive = useMutation({
    mutationFn: () => deleteApplication(id),
    onSuccess: () => {
      invalidate();
      router.push("/app");
      router.refresh();
    },
    onError: (err) => setActionError((err as Error).message),
  });

  /** Reopen: restores an archived application to its pre-archive status. */
  const reopen = useMutation({
    mutationFn: () => reopenApplication(id),
    onSuccess: invalidate,
    onError: (err) => setActionError((err as Error).message),
  });

  /** Toggle favourite (optimistic). */
  const favorite = useMutation({
    mutationFn: () => toggleFavorite(id),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["application", id] });
      const previous = qc.getQueryData(["application", id]);
      qc.setQueryData(["application", id], (old?: { data: ApplicationDetail }) =>
        old
          ? { ...old, data: { ...old.data, isFavorite: !old.data.isFavorite } }
          : old,
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(["application", id], ctx.previous);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["application", id] });
      qc.invalidateQueries({ queryKey: ["applications"] });
    },
  });

  if (isPending) {
    return (
      <div className="space-y-6 pt-6">
        <div>
          <Skeleton className="h-4 w-32" />
          <div className="mt-2 flex items-center gap-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <div className="mt-3 flex max-w-md items-center gap-3">
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-4 w-10" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div>
            <GhostPulse />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonGhostCard key={i} />
              ))}
            </div>
          </div>
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError || !data?.data) {
    return (
      <div className="pt-6">
        <Link href="/app" className="text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 inline h-4 w-4" />
          Back to dashboard
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
        <Link href="/app" className="text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 inline h-4 w-4" />
          Back to dashboard
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{app.company}</h1>
            <span className="text-lg text-muted-foreground">{app.role}</span>
            <StatusBadge status={app.displayStatus} />
            {app.displayStatus === "ghosted" && (
              <span className="text-xs text-muted-foreground">
                No updates in a while — any change revives it.
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={
                app.isFavorite ? "Remove from favourites" : "Add to favourites"
              }
              aria-pressed={app.isFavorite}
              onClick={() => favorite.mutate()}
              disabled={favorite.isPending}
            >
              <Star
                className={cn(
                  "h-5 w-5",
                  app.isFavorite && "fill-amber-400 text-amber-500",
                )}
              />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Application actions"
                >
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={scrollToForm}>
                <Pencil />
                Edit
              </DropdownMenuItem>
              {app.status === "archived" ? (
                <DropdownMenuItem
                  onSelect={() => reopen.mutate()}
                  disabled={reopen.isPending}
                >
                  <RotateCcw />
                  Reopen
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onSelect={() => setConfirmArchive(true)}
                  disabled={archive.isPending}
                >
                  <Archive />
                  Archive
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>
        {actionError && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {actionError}
          </p>
        )}
        <div className="mt-3 flex max-w-md items-center gap-3">
          <Progress
            value={app.progress}
            aria-label="Application progress"
            className="flex-1"
          />
          <span className="text-sm font-semibold tabular-nums">
            {app.progress}%
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <MilestoneTimeline appId={app.id} milestones={app.milestones} />
        <div id="application-details" className="scroll-mt-20">
          <EditApplicationForm app={app} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="Archive application?"
        description="It will be hidden from the dashboard. You can reopen it later from its page."
        confirmLabel="Archive"
        destructive
        loading={archive.isPending}
        onConfirm={() => {
          setConfirmArchive(false);
          archive.mutate();
        }}
      />
    </div>
  );
}
