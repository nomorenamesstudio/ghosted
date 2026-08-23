"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DashboardStats as Stats } from "@/lib/api";

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | null;
  highlight?: boolean;
}) {
  return (
    <Card
      className={
        highlight ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : ""
      }
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
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
      <StatCard label="Total" value={stats?.total ?? null} />
      <StatCard label="Active" value={stats?.active ?? null} />
      <StatCard label="Interviewing" value={stats?.interviewing ?? null} />
      <StatCard label="Offers" value={stats?.offers ?? null} />
      <StatCard label="Rejected" value={stats?.rejected ?? null} />
      <StatCard
        label="Needs action"
        value={stats?.needsAction ?? null}
        highlight={Boolean(stats && stats.needsAction > 0)}
      />
    </div>
  );
}
