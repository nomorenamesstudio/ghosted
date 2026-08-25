import { Skeleton } from "@/components/ui/skeleton";
import { GhostPulse, SkeletonGhostCard } from "@/components/loading";

export default function ApplicationDetailLoading() {
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
