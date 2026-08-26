"use client";

import { Files, Ghost } from "lucide-react";
import {
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { DisplayStatus } from "@/lib/utils/status";
import { StatusIcon } from "./status-icons";
import type { DashboardStats as Stats } from "@/lib/api";

/** Which filter each stat card applies ("" = all). */
const STAT_STATUS: Record<string, "" | DisplayStatus> = {
  Total: "",
  Applied: "applied",
  Interviewing: "interviewing",
  Offers: "offer",
  Rejected: "rejected",
  Ghosted: "ghosted",
};

function StatCard({
  label,
  value,
  icon,
  onSelect,
  active,
}: {
  label: string;
  value: number | null;
  icon: React.ReactNode;
  onSelect: (s: "" | DisplayStatus) => void;
  active: boolean;
}) {
  const status = STAT_STATUS[label];
  const body = (
    <>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <span className="text-violet-500">{icon}</span>
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="text-3xl font-bold tabular-nums"
          data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          {value === null ? <Skeleton className="h-8 w-10" /> : value}
        </div>
      </CardContent>
    </>
  );
  return (
    <button
      type="button"
      onClick={() => onSelect(status)}
      aria-pressed={active}
      className={cn(
        "rounded-xl border bg-gradient-to-br from-card to-violet-100/40 text-left shadow transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:to-violet-950/40",
        active && "border-violet-400/70 ring-2 ring-violet-500/70",
      )}
    >
      {body}
    </button>
  );
}

export function DashboardStats({
  stats,
  activeStatus,
  onSelect,
}: {
  stats?: Stats;
  activeStatus: "" | DisplayStatus;
  onSelect: (s: "" | DisplayStatus) => void;
}) {
  const cards: Array<{
    label: string;
    value: number | null;
    icon: React.ReactNode;
  }> = [
    { label: "Total", value: stats?.total ?? null, icon: <Files className="h-4 w-4" /> },
    { label: "Applied", value: stats?.active ?? null, icon: <StatusIcon status="applied" /> },
    { label: "Interviewing", value: stats?.interviewing ?? null, icon: <StatusIcon status="interviewing" /> },
    { label: "Offers", value: stats?.offers ?? null, icon: <StatusIcon status="offer" /> },
    { label: "Rejected", value: stats?.rejected ?? null, icon: <StatusIcon status="rejected" /> },
    { label: "Ghosted", value: stats?.ghosted ?? null, icon: <Ghost className="h-4 w-4" /> },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => (
        <StatCard
          key={c.label}
          {...c}
          onSelect={onSelect}
          active={activeStatus === STAT_STATUS[c.label]}
        />
      ))}
    </div>
  );
}
