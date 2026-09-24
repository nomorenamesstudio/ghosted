import type { DisplayStatus } from "@/lib/utils/status";

/**
 * The card's per-status colour tokens, kept out of `components/ApplicationCard`
 * on purpose: that module is a client component, and a server component cannot
 * import values from one (it gets an opaque client reference instead). The
 * landing page renders the same card with static data, so the tokens live here
 * where both sides can read them.
 *
 * These are written as `oklch()` instead of picked off Tailwind's ramp, because
 * the ramp's steps are not perceptually even: at the same lightness `amber-100`
 * carries 2.3x the colour of `sky-100` (OKLCH chroma 0.058 against 0.025), with
 * `emerald-100` at 0.051 and `red-100`/`violet-100` down at 0.031/0.028. Picking
 * the same step number for every status therefore produced cards of very
 * different volume — interviewing and offer shouted next to a ghosted one, and
 * the board looked like a board of different designs.
 *
 * So every layer holds ONE lightness and ONE chroma and varies only the hue. The
 * only numbers that should ever change are these three chroma values, plus the
 * lightness each layer sits at in each theme:
 *
 *   surface  oklch(0.951 0.030 <hue>)   dark  oklch(0.220 0.030 <hue>)
 *   border   oklch(0.885 0.050 <hue>)   dark  oklch(0.340 0.050 <hue>)
 *            hover oklch(0.845 0.070 <hue>)   dark  oklch(0.400 0.070 <hue>)
 *   track    oklch(0.862 0.062 <hue>)   dark  oklch(0.300 0.062 <hue>)
 *
 * with the hue taken from the -100 tint each status used to use. A status is
 * then carried by hue — and by the badge, which is deliberately one step louder
 * than the card it labels — never by how vivid a card happens to be.
 *
 * The classes are spelled out in full rather than assembled from those numbers:
 * Tailwind reads the source text, and a class built in a template literal is
 * never generated, so the tokens would silently render as transparent.
 *
 * Two deliberate exceptions: the progress FILL stays on the Tailwind ramp, since
 * it is the one element meant to be vivid and the part that already read well;
 * and `archived` stays neutral, being the only status that is not a hue.
 */

/** The badge variant each status wears — deliberately one step louder than the
 *  card it labels, so the label stays readable on a normalised surface. */
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

/** The card's own tint: opaque, and the same colour wherever the card sits. */
export const STATUS_TINT: Partial<Record<DisplayStatus, string>> = {
  applied:
    "bg-[color:oklch(0.951_0.03_236.8)] dark:bg-[color:oklch(0.22_0.03_236.8)]",
  interviewing:
    "bg-[color:oklch(0.951_0.03_95.6)] dark:bg-[color:oklch(0.22_0.03_95.6)]",
  offer:
    "bg-[color:oklch(0.951_0.03_163.1)] dark:bg-[color:oklch(0.22_0.03_163.1)]",
  rejected:
    "bg-[color:oklch(0.951_0.03_17.7)] dark:bg-[color:oklch(0.22_0.03_17.7)]",
  ghosted:
    "bg-[color:oklch(0.951_0.03_294.6)] dark:bg-[color:oklch(0.22_0.03_294.6)]",
  // Opaque, like every other tint here. It was `bg-muted/60`, and a translucent
  // tint is only the same colour if what is behind it is: over the board's white
  // column it read white-ish, over the dashboard's grey page it read grey, so the
  // same card looked like two different cards.
  archived: "bg-muted dark:bg-muted/20",
};

/** Border matching each status colour (pairs with the tint). */
export const STATUS_BORDER: Partial<Record<DisplayStatus, string>> = {
  applied:
    "border-[color:oklch(0.885_0.05_236.8)] hover:border-[color:oklch(0.845_0.07_236.8)] dark:border-[color:oklch(0.34_0.05_236.8)] dark:hover:border-[color:oklch(0.4_0.07_236.8)]",
  interviewing:
    "border-[color:oklch(0.885_0.05_95.6)] hover:border-[color:oklch(0.845_0.07_95.6)] dark:border-[color:oklch(0.34_0.05_95.6)] dark:hover:border-[color:oklch(0.4_0.07_95.6)]",
  offer:
    "border-[color:oklch(0.885_0.05_163.1)] hover:border-[color:oklch(0.845_0.07_163.1)] dark:border-[color:oklch(0.34_0.05_163.1)] dark:hover:border-[color:oklch(0.4_0.07_163.1)]",
  rejected:
    "border-[color:oklch(0.885_0.05_17.7)] hover:border-[color:oklch(0.845_0.07_17.7)] dark:border-[color:oklch(0.34_0.05_17.7)] dark:hover:border-[color:oklch(0.4_0.07_17.7)]",
  ghosted:
    "border-[color:oklch(0.885_0.05_294.6)] hover:border-[color:oklch(0.845_0.07_294.6)] dark:border-[color:oklch(0.34_0.05_294.6)] dark:hover:border-[color:oklch(0.4_0.07_294.6)]",
  archived:
    "border-zinc-300/70 hover:border-zinc-400/70 dark:border-zinc-700/60 dark:hover:border-zinc-600/60",
};

/** Progress bar colours harmonised with each status (track + fill). */
export const STATUS_PROGRESS: Record<
  DisplayStatus,
  { track: string; fill: string }
> = {
  applied: {
    track:
      "bg-[color:oklch(0.862_0.062_236.8)] dark:bg-[color:oklch(0.3_0.062_236.8)]",
    fill: "bg-sky-500 dark:bg-sky-400",
  },
  interviewing: {
    track:
      "bg-[color:oklch(0.862_0.062_95.6)] dark:bg-[color:oklch(0.3_0.062_95.6)]",
    fill: "bg-amber-500 dark:bg-amber-400",
  },
  offer: {
    track:
      "bg-[color:oklch(0.862_0.062_163.1)] dark:bg-[color:oklch(0.3_0.062_163.1)]",
    fill: "bg-emerald-500 dark:bg-emerald-400",
  },
  rejected: {
    track:
      "bg-[color:oklch(0.862_0.062_17.7)] dark:bg-[color:oklch(0.3_0.062_17.7)]",
    fill: "bg-red-500 dark:bg-red-400",
  },
  ghosted: {
    track:
      "bg-[color:oklch(0.862_0.062_294.6)] dark:bg-[color:oklch(0.3_0.062_294.6)]",
    fill: "bg-violet-500 dark:bg-violet-400",
  },
  // The archived track is a couple of steps darker than its own card: the card
  // is the muted grey, so a light track disappears into it (it was `bg-zinc-200/60`
  // and the bar looked broken rather than empty).
  archived: {
    track: "bg-zinc-400 dark:bg-zinc-800/50",
    fill: "bg-zinc-600 dark:bg-zinc-500",
  },
};
