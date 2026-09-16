import type { Milestone, ApplicationStatus } from "@/lib/db/schema";

export interface ProgressInput {
  status: ApplicationStatus;
  milestones: Pick<Milestone, "status">[];
  totalSteps: number;
}

/**
 * Progress calculation:
 * - 'offer' → 100%: the application succeeded, so the bar is full;
 * - everything else, including the terminal 'rejected' and 'archived', reports
 *   the state actually reached: round(doneCount / totalSteps * 100), where
 *   doneCount is the number of 'done' milestones capped at totalSteps. A
 *   rejection is not progress - it should show how far the application got, the
 *   same way an archived one does.
 */
export function calcProgress({
  status,
  milestones,
  totalSteps,
}: ProgressInput): number {
  if (status === "offer") return 100;

  const safeTotal = totalSteps > 0 ? totalSteps : 1;
  const doneCount = Math.min(
    milestones.filter((m) => m.status === "done").length,
    safeTotal,
  );
  return Math.round((doneCount / safeTotal) * 100);
}

export function isValidProgress(p: number): boolean {
  return Number.isFinite(p) && p >= 0 && p <= 100;
}
