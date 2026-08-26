"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStats } from "@/lib/api";
import type { DisplayStatus } from "@/lib/utils/status";
import { DashboardStats } from "./DashboardStats";
import { DonateBanner } from "./DonateBanner";
import { ApplicationList } from "./ApplicationList";
import { ScrollTopButton } from "./ScrollTopButton";

export function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: () => getStats(),
  });

  // Status filter, shared between the clickable stat cards and the dropdown.
  const [status, setStatus] = useState<"" | DisplayStatus>("");

  return (
    <>
      {/* sr-only h1 kept outside the spaced container so it doesn't push the
          banner down (space-y applies margin to every sibling after the first). */}
      <h1 className="sr-only">Applications</h1>
      <div className="space-y-6 pt-4">
        <DonateBanner offers={stats?.data?.offers ?? 0} />
        <DashboardStats
          stats={stats?.data}
          activeStatus={status}
          onSelect={setStatus}
        />
        <ApplicationList status={status} onStatusChange={setStatus} />
      </div>
      <ScrollTopButton />
    </>
  );
}
