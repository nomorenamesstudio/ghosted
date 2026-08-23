"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getStats } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { DashboardStats } from "./DashboardStats";
import { ApplicationList } from "./ApplicationList";
import { AddApplicationModal } from "./AddApplicationModal";

export function Dashboard() {
  const [addOpen, setAddOpen] = useState(false);
  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: () => getStats(),
  });

  return (
    <div className="space-y-6 pt-6">
      <DashboardStats stats={stats?.data} />
      <ApplicationList />
      <AddApplicationModal open={addOpen} onOpenChange={setAddOpen} />
      <Button
        size="icon"
        data-testid="add-application-fab"
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg"
        onClick={() => setAddOpen(true)}
        aria-label="Add application"
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  );
}
