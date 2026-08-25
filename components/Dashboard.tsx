"use client";

import { useQuery } from "@tanstack/react-query";
import { getStats } from "@/lib/api";
import { DashboardStats } from "./DashboardStats";
import { DonateBanner } from "./DonateBanner";
import { ApplicationList } from "./ApplicationList";

export function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: () => getStats(),
  });

  return (
    <>
      {/* sr-only h1 kept outside the spaced container so it doesn't push the
          banner down (space-y applies margin to every sibling after the first). */}
      <h1 className="sr-only">Applications</h1>
      <div className="space-y-6 pt-4">
        <DonateBanner offers={stats?.data?.offers ?? 0} />
        <DashboardStats stats={stats?.data} />
        <ApplicationList />
      </div>
    </>
  );
}
