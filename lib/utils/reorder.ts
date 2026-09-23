export interface MilestoneLike {
  id: string;
  stepOrder: number;
}

/**
 * Pure step-ordering helpers (unit-tested).
 *
 * step_order values are 0-based and must remain a dense sequence
 * (0..n-1) at rest; these helpers are used inside DB transactions.
 */

/**
 * Compute the new step_order assignments after inserting a milestone at
 * position `n` (0-based). All existing milestones with stepOrder >= n shift up
 * by 1. Returns the stepOrder the new milestone should receive.
 */
export function computeInsertShift(
  milestones: MilestoneLike[],
  position: number,
): { shifts: Array<{ id: string; stepOrder: number }>; newStepOrder: number } {
  const n = Math.max(0, Math.floor(position));
  const shifts = milestones
    .filter((m) => m.stepOrder >= n)
    .map((m) => ({ id: m.id, stepOrder: m.stepOrder + 1 }));
  return { shifts, newStepOrder: n };
}

/**
 * Compute the new step_order assignments after deleting the milestone with
 * the given id. All milestones with stepOrder > deletedIndex shift down by 1.
 * Returns null if the milestone is not found.
 *
 * The service no longer calls this: it performs the same shift as a single range
 * UPDATE (`step_order - 1` where `step_order > deleted`), because the rows are
 * contiguous rather than a list. This stays as the readable statement of the
 * rule, and its unit test pins the semantics the SQL mirrors.
 */
export function computeDeleteShift(
  milestones: MilestoneLike[],
  deletedId: string,
): { shifts: Array<{ id: string; stepOrder: number }> } | null {
  const target = milestones.find((m) => m.id === deletedId);
  if (!target) return null;
  const shifts = milestones
    .filter((m) => m.stepOrder > target.stepOrder)
    .map((m) => ({ id: m.id, stepOrder: m.stepOrder - 1 }));
  return { shifts };
}

/** Sort milestones by step_order ascending. */
export function sortByStepOrder<T extends MilestoneLike>(items: T[]): T[] {
  return [...items].sort((a, b) => a.stepOrder - b.stepOrder);
}

/**
 * Total steps after an insert: the new timeline length (min 1).
 * Inserting anywhere grows the count by exactly one.
 */
export function totalStepsAfterInsert(previousCount: number): number {
  return Math.max(1, previousCount + 1);
}

/** Total steps after a delete: the remaining timeline length (min 1). */
export function totalStepsAfterDelete(previousCount: number): number {
  return Math.max(1, previousCount - 1);
}

/**
 * The default 5-step timeline titles, step_order 0..4.
 */
export const DEFAULT_MILESTONE_TITLES = [
  "Application",
  "HR Screen",
  "Technical Interview",
  "Test/Homework",
  "Offer/Decision",
] as const;

export function defaultMilestones(applicationId: string) {
  return DEFAULT_MILESTONE_TITLES.map((title, stepOrder) => ({
    applicationId,
    stepOrder,
    title,
    status: "pending" as const,
  }));
}
