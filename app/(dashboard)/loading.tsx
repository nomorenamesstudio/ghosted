import { Skeleton } from "@/components/ui/skeleton";
import { GhostPulse, SkeletonGhostCard } from "@/components/loading";

export default function DashboardLoading() {
  return (
    <div className="space-y-6 pt-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonGhostCard key={i} />
        ))}
        <GhostPulse />
      </div>
    </div>
  );
}
