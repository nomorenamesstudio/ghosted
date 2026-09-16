"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    /** Extra classes for the fill bar (e.g. per-status colors). */
    indicatorClassName?: string;
    /**
     * Number of steps the bar represents. Draws a hairline at every boundary
     * (5 steps → 4 dividers) so the bar reads as a timeline rather than one
     * continuous fill. 0 or 1 draws nothing.
     */
    segments?: number;
    /**
     * Color of those dividers. Defaults to the card surface (`--card` is the
     * same token as `--background` here), so the bar is knocked out into real
     * pieces - visible across the empty track as well as the fill.
     */
    segmentClassName?: string;
  }
>(
  (
    {
      className,
      value,
      indicatorClassName,
      segments = 0,
      segmentClassName,
      ...props
    },
    ref,
  ) => (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full w-full flex-1 bg-primary transition-all",
          indicatorClassName,
        )}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
      {segments > 1 &&
        Array.from({ length: segments - 1 }, (_, i) => (
          <span
            key={i}
            aria-hidden
            data-testid="progress-segment"
            className={cn(
              "pointer-events-none absolute inset-y-0 w-[2px] bg-card",
              segmentClassName,
            )}
            // Centred on the boundary, so the first and last pieces are equal.
            style={{ left: `${((i + 1) / segments) * 100}%`, marginLeft: "-1px" }}
          />
        ))}
    </ProgressPrimitive.Root>
  ),
);
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
