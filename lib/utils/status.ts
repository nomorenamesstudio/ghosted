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
 * The instant an application of this age stops counting as active.
 *
 * Shared deliberately: the board and the list decide "ghosted" in JS from
 * `Date.now()`, while the `getStats` aggregate does it in SQL. Comparing SQL
 * against the database's own `now()` instead puts the two clocks on either side
 * of an application that sits exactly on the threshold — which the seed data
 * does — so the aggregate can disagree with the section it is counting. Both
 * sides compare against this one timestamp.
 */
export function ghostedCutoff(days: number = ghostedAfterDays()): Date {
  return new Date(Date.now() - days * MS_PER_DAY);
}

/**
 * "Ghosted": status is 'applied' or 'interviewing' AND the employer has been
 * quiet for longer than the user's patience threshold.
 *
 * `updatedAt` is the *silence clock*, not "the row was written": it only moves
 * on an employer-facing event - real forward progress, or a correction that
 * puts it back on the timeline's evidence (see `signalEffect` and
 * `timelineSignalAt`). Editing notes, adding a company website, favouriting or
 * moving a card forward and straight back must not un-ghost anything, or the
 * board hides exactly the silence it exists to show.
 */
export function isGhosted(
  status: ApplicationStatus,
  updatedAt: Date | string,
  days: number = ghostedAfterDays(),
): boolean {
  if (status !== "applied" && status !== "interviewing") return false;
  const cutoff = ghostedCutoff(days).getTime();
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

/* ------------------------------------------------------------------ */
/* The silence clock                                                   */
/* ------------------------------------------------------------------ */

/**
 * What a status change does to the silence clock (`applications.updated_at`).
 *
 * The clock answers one question - how long has the employer been quiet? - so
 * only employer-facing events may move it:
 *
 * - `advance`: real forward progress (applied → interviewing → offer), or a
 *   move back into the pipeline out of an outcome (un-ghosting by hand,
 *   reopening an archived application). Something happened, so the silence
 *   starts over.
 * - `restore`: a correction that moves the pipeline backwards. The clock goes
 *   back to the newest evidence on the timeline instead of restarting, so a
 *   card dragged forward by accident and dragged back does not read as freshly
 *   touched.
 * - `hold`: the status did not change (the edit modal sends the whole form,
 *   status included), or the move is into an outcome - the ghosted rule only
 *   applies to 'applied' and 'interviewing', so a dead end or the filing
 *   cabinet has no clock to restart.
 */
export type SignalEffect = "advance" | "restore" | "hold";

export function signalEffect(
  from: ApplicationStatus,
  to: ApplicationStatus,
): SignalEffect {
  if (from === to) return "hold";
  const fromRank = pipelineRank(from);
  const toRank = pipelineRank(to);
  if (toRank > fromRank) return "advance";
  if (toRank >= 0 && toRank < fromRank) return "restore";
  return "hold";
}

/**
 * The newest evidence of employer activity on an application: when it was sent,
 * or the date of a step that is actually `done`, whichever is later.
 *
 * Used to put the silence clock back where it belongs after a correction.
 * Pending steps are ignored - a plan is not a signal, and counting one would
 * make the employer look more recent than they are. A completed step without a
 * date falls back to when its row was written (marking a step done stamps it
 * with today's date, so this is the rare case).
 */
export function timelineSignalAt(
  createdAt: Date | string,
  milestones: Array<{
    status: MilestoneStatus;
    date: Date | string | null;
    createdAt: Date | string;
  }>,
): Date {
  let newest = new Date(createdAt).getTime();
  for (const milestone of milestones) {
    if (milestone.status !== "done") continue;
    const at = new Date(milestone.date ?? milestone.createdAt).getTime();
    if (at > newest) newest = at;
  }
  return new Date(newest);
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
