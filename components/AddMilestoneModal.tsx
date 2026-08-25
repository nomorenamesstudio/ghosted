"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { addMilestone, ApiClientError } from "@/lib/api";
import type { Milestone } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AddMilestoneModal({
  appId,
  milestones,
  open,
  onOpenChange,
}: {
  appId: string;
  milestones: Milestone[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [comment, setComment] = useState("");
  // undefined → append at the end; otherwise a 0-based insertion index.
  const [position, setPosition] = useState<string>("end");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      addMilestone(appId, {
        title,
        date: date ? new Date(date).toISOString() : null,
        comment: comment || null,
        position: position === "end" ? undefined : Number(position),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["application", appId] });
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setTitle("");
      setDate("");
      setComment("");
      setPosition("end");
      setError(null);
      onOpenChange(false);
    },
    onError: (err) => {
      setError(
        err instanceof ApiClientError ? err.message : "Failed to add milestone",
      );
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add milestone</DialogTitle>
          <DialogDescription>
            Insert a step into the timeline (later steps shift down).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="milestone-title">Title *</Label>
            <Input
              id="milestone-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. On-site Interview"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="milestone-date">Date</Label>
            <Input
              id="milestone-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="milestone-position">Insert at</Label>
            <select
              id="milestone-position"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="end">At the end</option>
              {milestones.map((m, i) => (
                <option key={m.id} value={i}>
                  Before: {m.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="milestone-comment">Comment</Label>
            <Textarea
              id="milestone-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              <X />
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                "Adding…"
              ) : (
                <>
                  <Plus />
                  Add milestone
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
