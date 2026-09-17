"use client";

import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViewMode } from "./ApplicationList";

/**
 * Segmented control for List / Board.
 *
 * Deliberately not built from Button variants: the selected segment is a raised
 * card-coloured chip on a muted track, which is what makes the active state
 * readable. `secondary` sits within ~1.1:1 of its own background in both themes,
 * so the old version looked like neither side was selected.
 */
export function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (view: ViewMode) => void;
}) {
  const options = [
    { value: "list" as const, label: "List", Icon: List },
    { value: "board" as const, label: "Board", Icon: LayoutGrid },
  ];

  return (
    <div
      role="group"
      aria-label="View"
      className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5"
    >
      {options.map(({ value, label, Icon }) => {
        const active = view === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
