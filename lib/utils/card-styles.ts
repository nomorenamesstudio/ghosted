import type { DisplayStatus } from "@/lib/utils/status";

/**
 * The card's per-status colour tokens, kept out of `components/ApplicationCard`
 * on purpose: that module is a client component, and a server component cannot
 * import values from one (it gets an opaque client reference instead). The
 * landing page renders the same card with static data, so the tokens live here
 * where both sides can read them.
 */

export const STATUS_VARIANT: Record<
  DisplayStatus,
  "default" | "info" | "warning" | "success" | "danger" | "violet" | "muted"
> = {
  applied: "info",
  interviewing: "warning",
  offer: "success",
  rejected: "danger",
  archived: "muted",
  ghosted: "violet",
};

/** Very light per-status background tint on the cards. */
export const STATUS_TINT: Partial<Record<DisplayStatus, string>> = {
  applied: "bg-sky-100 dark:bg-sky-950/20",
  interviewing: "bg-amber-100 dark:bg-amber-950/20",
  offer: "bg-emerald-100 dark:bg-emerald-950/20",
  rejected: "bg-red-100 dark:bg-red-950/20",
  ghosted: "bg-violet-100 dark:bg-violet-950/20",
  // Opaque, like every other tint here. It was `bg-muted/60`, and a translucent
  // tint is only the same colour if what is behind it is: over the board's white
  // column it read white-ish, over the dashboard's grey page it read grey, so the
  // same card looked like two different cards.
  archived: "bg-muted dark:bg-muted/20",
};

/** Muted border matching each status colour (pairs with the tint). */
export const STATUS_BORDER: Partial<Record<DisplayStatus, string>> = {
  applied:
    "border-sky-300/70 hover:border-sky-400/70 dark:border-sky-800/60 dark:hover:border-sky-700/60",
  interviewing:
    "border-amber-300/70 hover:border-amber-400/70 dark:border-amber-800/60 dark:hover:border-amber-700/60",
  offer:
    "border-emerald-300/70 hover:border-emerald-400/70 dark:border-emerald-800/60 dark:hover:border-emerald-700/60",
  rejected:
    "border-red-300/70 hover:border-red-400/70 dark:border-red-900/60 dark:hover:border-red-800/60",
  ghosted:
    "border-violet-300/70 hover:border-violet-400/70 dark:border-violet-800/60 dark:hover:border-violet-700/60",
  archived:
    "border-zinc-300/70 hover:border-zinc-400/70 dark:border-zinc-700/60 dark:hover:border-zinc-600/60",
};

/** Progress bar colours harmonised with each status (track + fill). */
export const STATUS_PROGRESS: Record<
  DisplayStatus,
  { track: string; fill: string }
> = {
  applied: {
    track: "bg-sky-300 dark:bg-sky-900/50",
    fill: "bg-sky-500 dark:bg-sky-400",
  },
  interviewing: {
    track: "bg-amber-300 dark:bg-amber-900/50",
    fill: "bg-amber-500 dark:bg-amber-400",
  },
  offer: {
    track: "bg-emerald-300 dark:bg-emerald-900/50",
    fill: "bg-emerald-500 dark:bg-emerald-400",
  },
  rejected: {
    track: "bg-red-300 dark:bg-red-900/50",
    fill: "bg-red-500 dark:bg-red-400",
  },
  ghosted: {
    track: "bg-violet-300 dark:bg-violet-900/50",
    fill: "bg-violet-500 dark:bg-violet-400",
  },
  archived: {
    track: "bg-zinc-200/60 dark:bg-zinc-800/50",
    fill: "bg-zinc-400 dark:bg-zinc-500",
  },
};
