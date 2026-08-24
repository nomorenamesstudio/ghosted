import type { ApplicationStatus, MilestoneStatus } from "@/lib/db/schema";

/** Manual terminal states: never overridden by milestone changes. */
export const MANUAL_STATUSES: ApplicationStatus[] = ["rejected", "archived"];

/**
 * Auto-advance rule (documented in README):
 * - 'rejected' / 'archived' are manual overrides and are never rewritten.
 * - All milestones 'done' → 'offer'.
 * - At least two milestones 'done' (i.e., past the first step) → 'interviewing'.
 * - Otherwise → 'applied'.
 *
 * This is deliberately based on the *count* of done milestones rather than
 * step indices, because the timeline is kept ordered "done first" (pending
 * steps always come after done ones), so positional rules would be unstable.
 * Skipped milestones do not count as done.
 */
export function deriveStatus(
  current: ApplicationStatus,
  milestones: Array<{ status: MilestoneStatus }>,
): ApplicationStatus {
  if (MANUAL_STATUSES.includes(current)) return current;

  const doneCount = milestones.filter((m) => m.status === "done").length;
  if (milestones.length > 0 && doneCount >= milestones.length) return "offer";
  if (doneCount >= 2) return "interviewing";
  return "applied";
}

/** The displayed status set — includes the time-derived "ghosted" overlay. */
export type DisplayStatus = ApplicationStatus | "ghosted";

/** Applications untouched for this many days (applied|interviewing) are shown
 *  as "ghosted". Default 14 days (2 weeks); override with GHOSTED_AFTER_DAYS. */
export const GHOSTED_AFTER_DAYS = Number(
  process.env.GHOSTED_AFTER_DAYS ?? 14,
);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * "Ghosted": status is 'applied' or 'interviewing' AND the application has
 * not been updated in GHOSTED_AFTER_DAYS (based on updated_at). Any edit or
 * milestone change refreshes updated_at and un-ghosts the application.
 */
export function isGhosted(
  status: ApplicationStatus,
  updatedAt: Date | string,
): boolean {
  if (status !== "applied" && status !== "interviewing") return false;
  const cutoff = Date.now() - GHOSTED_AFTER_DAYS * MS_PER_DAY;
  return new Date(updatedAt).getTime() < cutoff;
}

/** Effective (display) status: ghosted when the app is stale, else raw. */
export function displayStatusOf(
  status: ApplicationStatus,
  updatedAt: Date | string,
): DisplayStatus {
  return isGhosted(status, updatedAt) ? "ghosted" : status;
}
