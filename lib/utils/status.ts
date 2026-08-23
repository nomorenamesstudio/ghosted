import type { ApplicationStatus, MilestoneStatus } from "@/lib/db/schema";

/** Manual terminal states: never overridden by milestone changes. */
export const MANUAL_STATUSES: ApplicationStatus[] = ["rejected", "archived"];

/**
 * Auto-advance rule (documented in README):
 * - 'rejected' / 'archived' are manual overrides and are never rewritten.
 * - If the final milestone (highest step_order) is 'done' → 'offer'.
 * - Else if any milestone at step_order >= 2 (Technical Interview stage or
 *   later) is 'done' → 'interviewing'.
 * - Else → 'applied'.
 */
export function deriveStatus(
  current: ApplicationStatus,
  milestones: Array<{ stepOrder: number; status: MilestoneStatus }>,
): ApplicationStatus {
  if (MANUAL_STATUSES.includes(current)) return current;

  if (milestones.length === 0) return "applied";

  const sorted = [...milestones].sort((a, b) => a.stepOrder - b.stepOrder);
  const last = sorted[sorted.length - 1];
  if (last.status === "done") return "offer";

  const advanced = sorted.some(
    (m) => m.stepOrder >= 2 && m.status === "done",
  );
  return advanced ? "interviewing" : "applied";
}

export const NEEDS_ACTION_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * "Needs action": status is 'applied' or 'interviewing' AND the application
 * has not been updated in the last 7 days (based on updated_at).
 */
export function isNeedsAction(
  status: ApplicationStatus,
  updatedAt: Date | string,
): boolean {
  if (status !== "applied" && status !== "interviewing") return false;
  const cutoff = Date.now() - NEEDS_ACTION_DAYS * MS_PER_DAY;
  return new Date(updatedAt).getTime() < cutoff;
}
