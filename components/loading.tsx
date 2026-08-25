import { Ghost } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/** A pulsing ghost — the app's loading motif. */
export function GhostPulse({ className }: { className?: string }) {
  return (
    <div className={cn("flex justify-center py-4", className)} aria-hidden>
      <Ghost className="h-8 w-8 animate-pulse text-violet-400" />
    </div>
  );
}

/** A card-shaped placeholder that mirrors an ApplicationCard. */
export function SkeletonGhostCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-xl border bg-card p-4",
        className,
      )}
      aria-hidden
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-16 rounded-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="flex w-32 shrink-0 flex-col items-end gap-1.5">
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-2 w-full" />
      </div>
    </div>
  );
}
