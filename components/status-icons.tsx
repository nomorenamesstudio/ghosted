"use client";

import {
  Archive,
  BadgeCheck,
  CheckCircle2,
  Circle,
  Ghost,
  Send,
  SkipForward,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ApplicationStatus, MilestoneStatus } from "@/lib/db/schema";
import type { DisplayStatus } from "@/lib/utils/status";

/** Icons for displayed statuses — used in badges, stats and dropdowns. */
export const STATUS_ICONS: Record<DisplayStatus, LucideIcon> = {
  applied: Send,
  interviewing: Users,
  offer: BadgeCheck,
  rejected: XCircle,
  archived: Archive,
  ghosted: Ghost,
};

export const MILESTONE_STATUS_ICONS: Record<MilestoneStatus, LucideIcon> = {
  pending: Circle,
  done: CheckCircle2,
  skipped: SkipForward,
};

export function StatusIcon({
  status,
  className,
}: {
  status: DisplayStatus | ApplicationStatus;
  className?: string;
}) {
  const Icon = STATUS_ICONS[status];
  return <Icon className={className ?? "h-4 w-4"} aria-hidden />;
}
