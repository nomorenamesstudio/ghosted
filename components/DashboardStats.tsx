"use client";

import { Activity, Clock, Files } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusIcon } from "./status-icons";
import type { DashboardStats as Stats } from "@/lib/api";

function StatCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: number | null;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <Card
      className={
        highlight ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : ""
      }
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <span className="text-foreground/60">{icon}</span>
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="text-3xl font-bold tabular-nums"
          data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          {value === null ? "…" : value}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardStats({ stats }: { stats?: Stats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <StatCard label="Total" value={stats?.total ?? null} icon={<Files className="h-4 w-4" />} />
      <StatCard label="Active" value={stats?.active ?? null} icon={<Activity className="h-4 w-4" />} />
      <StatCard
        label="Interviewing"
        value={stats?.interviewing ?? null}
        icon={<StatusIcon status="interviewing" />}
      />
      <StatCard
        label="Offers"
        value={stats?.offers ?? null}
        icon={<StatusIcon status="offer" />}
      />
      <StatCard
        label="Rejected"
        value={stats?.rejected ?? null}
        icon={<StatusIcon status="rejected" />}
      />
      <StatCard
        label="Cold"
        value={stats?.needsAction ?? null}
        icon={<Clock className="h-4 w-4" />}
        highlight={Boolean(stats && stats.needsAction > 0)}
      />
    </div>
  );
}
