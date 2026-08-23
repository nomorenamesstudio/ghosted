import type { Milestone, ApplicationStatus } from "@/lib/db/schema";

export interface ProgressInput {
  status: ApplicationStatus;
  milestones: Pick<Milestone, "status">[];
  totalSteps: number;
}

/**
 * Progress calculation per spec:
 * - 'offer' or 'rejected' → 100%
 * - otherwise: round(doneCount / totalSteps * 100), where doneCount is the
 *   number of 'done' milestones capped at totalSteps.
 */
export function calcProgress({
  status,
  milestones,
  totalSteps,
}: ProgressInput): number {
  if (status === "offer" || status === "rejected") return 100;

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
