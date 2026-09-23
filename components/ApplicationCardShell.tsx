import type { ReactNode } from "react";
import { Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusIcon } from "./status-icons";
import { cn } from "@/lib/utils";
import {
  STATUS_BORDER,
  STATUS_PROGRESS,
  STATUS_TINT,
  STATUS_VARIANT,
} from "@/lib/utils/card-styles";
import type { DisplayStatus } from "@/lib/utils/status";

/**
 * The application card's markup, as a *server* component.
 *
 * `ApplicationCardView` wraps this for the real dashboard card, passing the
 * pieces that genuinely need the client: a live "updated 2 days ago" (date-fns),
 * the Radix avatar and the Radix progress bar. The landing page renders the same
 * shell directly with static values, which is why the marketing page no longer
 * loads date-fns, Radix Progress or Radix Avatar to draw four decorative cards
 * (measured: 10 kB + 4 kB + part of an 8 kB chunk on that route).
 *
 * Keeping one shell rather than a copy is the point: the two must look
 * identical, and a duplicated 60-line card would drift the first time either
 * side is touched.
 */
export function ApplicationCardShell({
  status,
  company,
  role,
  isFavorite = false,
  currentRound,
  updatedLabel,
  progress,
  milestoneCount = 0,
  avatar,
  progressBar,
  compact = false,
  reserveActions = false,
  className,
}: {
  status: DisplayStatus;
  company: string;
  role: string;
  isFavorite?: boolean;
  currentRound?: string | null;
  /** Pre-formatted: the client formats it live, the landing ships a fixed one. */
  updatedLabel: string;
  progress: number;
  milestoneCount?: number;
  avatar: ReactNode;
  /** Defaults to a static bar mirroring `components/ui/progress`. */
  progressBar?: ReactNode;
  compact?: boolean;
  reserveActions?: boolean;
  className?: string;
}) {
  const styles = STATUS_PROGRESS[status];

  return (
    <Card
      className={cn(
        "card-sheen transition-colors",
        STATUS_TINT[status],
        STATUS_BORDER[status],
        className,
      )}
    >
      <CardContent className={cn("flex flex-col gap-3", compact ? "p-3" : "p-4")}>
        {/* Identity block: everything is indented past the logo, and the status
            badge is pinned to the card's top-right corner. */}
        <div className="flex min-w-0 items-start gap-2">
          {avatar}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{company}</span>
              {isFavorite && (
                <Star
                  className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500"
                  aria-hidden
                />
              )}
              <Badge
                variant={STATUS_VARIANT[status]}
                className="ml-auto shrink-0 gap-1 capitalize"
              >
                <StatusIcon status={status} className="h-3 w-3" />
                {status}
              </Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground">{role}</p>
          </div>
        </div>

        {/* Hairline across the full card, then the dates and the progress:
            side by side on the wide list card, stacked in a kanban column. */}
        <div
          className={cn(
            "flex flex-col gap-2 border-t pt-2",
            !compact && "sm:flex-row sm:items-center sm:justify-between sm:gap-4",
          )}
        >
          {/* Always two lines: the round it reached, then how fresh it is. */}
          <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
            {currentRound && <span>Last round: {currentRound}</span>}
            <span>{updatedLabel}</span>
          </div>
          <div
            className={cn(
              "flex shrink-0 items-center gap-2",
              !compact ? "sm:w-48" : "w-full",
              reserveActions && "pr-9",
            )}
          >
            <span className="text-xs font-semibold tabular-nums">
              {progress}%
            </span>
            {progressBar ?? (
              <ApplicationProgressBar
                value={progress}
                segments={milestoneCount}
                track={styles.track}
                fill={styles.fill}
                className="flex-1"
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * A static twin of `components/ui/progress`, for server-rendered cards. Same
 * classes, same `translateX` fill, same boundary hairlines — Radix's root is
 * only a div with a role and an indicator, so nothing visual is lost by not
 * hydrating it, and the landing page does not need a client boundary for a bar
 * nobody touches.
 */
export function ApplicationProgressBar({
  value,
  segments = 0,
  track,
  fill,
  className,
}: {
  value: number;
  segments?: number;
  track: string;
  fill: string;
  className?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label="Application progress"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
        track,
        className,
      )}
    >
      <div
        className={cn("h-full w-full flex-1 bg-primary transition-all", fill)}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
      {segments > 1 &&
        Array.from({ length: segments - 1 }, (_, i) => (
          <span
            key={i}
            aria-hidden
            data-testid="progress-segment"
            className="pointer-events-none absolute inset-y-0 w-[2px] bg-card"
            style={{
              left: `${((i + 1) / segments) * 100}%`,
              marginLeft: "-1px",
            }}
          />
        ))}
    </div>
  );
}
