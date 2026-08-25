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
    <div className="space-y-6 pt-4">
      <h1 className="sr-only">Applications</h1>
      <DonateBanner offers={stats?.data?.offers ?? 0} />
      <DashboardStats stats={stats?.data} />
      <ApplicationList />
    </div>
  );
}
