import type {
  ApplicationStatus,
  MilestoneStatus,
  PatienceLevel,
} from "@/lib/db/schema";

/** Manual terminal states: never overridden by milestone changes. */
export const MANUAL_STATUSES: ApplicationStatus[] = [
  "rejected",
  "archived",
  "offer",
  "ghosted",
];

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

/** Fallback threshold when no user setting is in hand (ops override). */
export const GHOSTED_AFTER_DAYS = Number(
  process.env.GHOSTED_AFTER_DAYS ?? 14,
);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How long an application may sit untouched before it shows up as ghosted.
 * Chosen per user in Settings ("Patience level"); `realistic` is the default.
 */
export const PATIENCE_LEVELS = ["generous", "realistic", "impatient"] as const;

export const DEFAULT_PATIENCE_LEVEL: PatienceLevel = "realistic";

export const PATIENCE_DAYS: Record<PatienceLevel, number> = {
  generous: 14,
  realistic: 10,
  impatient: 7,
};

export const PATIENCE_LABELS: Record<PatienceLevel, string> = {
  generous: "Generous (14 days)",
  realistic: "Realistic (10 days)",
  impatient: "Impatient mode (7 days)",
};

/** Days before an application counts as ghosted, for one user's setting. */
export function ghostedAfterDays(level?: PatienceLevel | null): number {
  if (!level) return PATIENCE_DAYS[DEFAULT_PATIENCE_LEVEL];
  return PATIENCE_DAYS[level] ?? GHOSTED_AFTER_DAYS;
}

/**
 * "Ghosted": status is 'applied' or 'interviewing' AND the application has not
 * been updated within the user's patience threshold (based on updated_at). Any
 * edit or milestone change refreshes updated_at and un-ghosts it.
 */
export function isGhosted(
  status: ApplicationStatus,
  updatedAt: Date | string,
  days: number = ghostedAfterDays(),
): boolean {
  if (status !== "applied" && status !== "interviewing") return false;
  const cutoff = Date.now() - days * MS_PER_DAY;
  return new Date(updatedAt).getTime() < cutoff;
}

/** Effective (display) status: ghosted when the app is stale, else raw. */
export function displayStatusOf(
  status: ApplicationStatus,
  updatedAt: Date | string,
  days?: number,
): DisplayStatus {
  return isGhosted(status, updatedAt, days) ? "ghosted" : status;
}

/** Status groups on the dashboard, most important first (list view). */
export const STATUS_ORDER: DisplayStatus[] = [
  "offer",
  "interviewing",
  "applied",
  "ghosted",
  "rejected",
  "archived",
];

/**
 * Kanban column order: the stages in the order they actually happen, with the
 * dead ends and the filing cabinet after them. Deliberately different from
 * STATUS_ORDER - a board is read left to right as a pipeline, a list is read
 * top down by importance.
 */
export const BOARD_ORDER: DisplayStatus[] = [
  "applied",
  "interviewing",
  "offer",
  "ghosted",
  "rejected",
  "archived",
];

/** Statuses a user can set by hand, in pipeline order (ghosted included). */
export const SETTABLE_STATUSES: ApplicationStatus[] = [
  "applied",
  "interviewing",
  "offer",
  "ghosted",
  "rejected",
  "archived",
];

export const STATUS_TITLES: Record<DisplayStatus, string> = {
  offer: "Offers",
  interviewing: "Interviewing",
  applied: "Applied",
  ghosted: "Ghosted",
  rejected: "Rejected",
  archived: "Archived",
};

/**
 * The stages that genuinely follow each other, earliest first. Anything
 * outside this list (ghosted, rejected, archived) is an outcome, not a stage.
 */
export const PIPELINE_ORDER: ApplicationStatus[] = [
  "applied",
  "interviewing",
  "offer",
];

function pipelineRank(status: DisplayStatus): number {
  return PIPELINE_ORDER.indexOf(status as ApplicationStatus);
}

/**
 * True when a move goes *backwards* through the pipeline (offer →
 * interviewing, offer → applied, interviewing → applied). Those moves usually
 * mean something happened that the timeline does not know about, so the UI asks
 * before rewriting history. Moves out of an outcome status (un-ghosting,
 * reopening an archived application) are not step-backs.
 */
export function isStepBack(from: DisplayStatus, to: ApplicationStatus): boolean {
  return stepBackKind(from, to) !== null;
}

/**
 * What to ask when a card goes backwards:
 *
 * - `offer` was the last stage reached, so going back usually means another
 *   round happened → offer to add a step to the timeline;
 * - `interviewing` → `applied` is all the way back to the start → offer to
 *   reset the timeline instead.
 *
 * Returns null for anything that is not a step back. Written as an explicit
 * map rather than arithmetic so adding a pipeline stage fails loudly here
 * instead of silently picking the wrong question.
 */
export function stepBackKind(
  from: DisplayStatus,
  to: ApplicationStatus,
): "add-step" | "reset" | null {
  const fromRank = pipelineRank(from);
  const toRank = pipelineRank(to);
  if (fromRank < 0 || toRank < 0 || toRank >= fromRank) return null;

  if (from === "offer") return "add-step";
  if (from === "interviewing" && to === "applied") return "reset";
  return null;
}

/** Suggested timeline step title when a step-back is confirmed. */
export const STEP_BACK_TITLES: Partial<Record<ApplicationStatus, string>> = {
  applied: "Application reopened",
  interviewing: "Additional interview round",
  offer: "Offer back on the table",
};
