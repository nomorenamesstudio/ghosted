"use client";

import { useQuery } from "@tanstack/react-query";
import { getStats } from "@/lib/api";
import { DashboardStats } from "./DashboardStats";
import { ApplicationList } from "./ApplicationList";

export function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: () => getStats(),
  });

  return (
    <div className="space-y-6 pt-6">
      <h1 className="sr-only">Applications</h1>
      <DashboardStats stats={stats?.data} />
      <ApplicationList />
    </div>
  );
}
