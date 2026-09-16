"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import type { ApplicationStatus } from "@/lib/db/schema";
import {
  STATUS_TITLES,
  STEP_BACK_TITLES,
  type DisplayStatus,
} from "@/lib/utils/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Asked when a card is moved *backwards* through the pipeline. The question
 * depends on where it came from:
 *
 * - back from Offers: that was the last stage, so going back usually means
 *   another round happened - offer to record it;
 * - back from Interviewing to Applied: the whole process starts over - offer to
 *   reset the timeline instead.
 *
 * Either way the card can also be moved with the timeline left untouched, or
 * the move can be abandoned entirely - in which case nothing is written and the
 * card never left its column.
 */
export function StepBackDialog({
  kind,
  company,
  from,
  to,
  defaultTitle,
  open,
  isPending,
  error,
  onConfirm,
  onMoveAnyway,
  onOpenChange,
}: {
  kind: "add-step" | "reset";
  company: string;
  from: DisplayStatus;
  to: ApplicationStatus;
  defaultTitle: string;
  open: boolean;
  isPending: boolean;
  error: string | null;
  onConfirm: (title: string) => void;
  onMoveAnyway: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState(defaultTitle);

  // Each step-back reopens with its own suggestion.
  useEffect(() => {
    if (open) setTitle(defaultTitle);
  }, [open, defaultTitle]);

  const isReset = kind === "reset";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isReset ? "Reset the timeline?" : "Add a step?"}
          </DialogTitle>
          <DialogDescription>
            Moving {company || "this application"} back from{" "}
            {STATUS_TITLES[from]} to {STATUS_TITLES[to]}{" "}
            {isReset
              ? "starts the process over. Reset the timeline — every step back to pending, its date cleared — or move the card and keep the progress you have."
              : "usually means another round happened. Add it to the timeline, or move the card without recording one."}
          </DialogDescription>
        </DialogHeader>

        {!isReset && (
          <div className="space-y-2">
            <Label htmlFor="step-back-title">New step</Label>
            <Input
              id="step-back-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={STEP_BACK_TITLES[to] ?? "New step"}
            />
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Tertiary option, above the footer rather than inside it: three
            labels do not fit a max-w-lg dialog's footer, and a wide footer
            stretches the grid column, which drags the title and description
            past the dialog's own padding. */}
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onMoveAnyway}
            disabled={isPending}
          >
            Leave it as is, but move
          </Button>
        </div>

        <DialogFooter className="sm:flex-wrap">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(title.trim() || defaultTitle)}
            disabled={isPending}
          >
            {isReset ? <RotateCcw /> : <ArrowLeft />}
            {isPending
              ? isReset
                ? "Resetting…"
                : "Adding…"
              : isReset
                ? "Reset timeline and move"
                : "Add step and move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
