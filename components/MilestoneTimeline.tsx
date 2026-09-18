"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Minus, Plus, Save, Trash2 } from "lucide-react";
import { deleteMilestone, updateMilestone } from "@/lib/api";
import type { Milestone } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AddMilestoneModal } from "./AddMilestoneModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { MILESTONE_STATUS_ICONS } from "./status-icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


export function MilestoneTimeline({
  appId,
  milestones,
}: {
  appId: string;
  milestones: Milestone[];
}) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  // Accordion: at most one milestone is open for editing at a time.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [userPicked, setUserPicked] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editComment, setEditComment] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStatus, setEditStatus] = useState<Milestone["status"]>("pending");
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Milestone | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["application", appId] });
    qc.invalidateQueries({ queryKey: ["applications"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  };


  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMilestone(id),
    onSuccess: () => invalidate(),
  });

  const saveEdit = useMutation({
    mutationFn: () =>
      updateMilestone(expandedId!, {
        title: editTitle,
        comment: editComment || null,
        date: editDate ? new Date(editDate).toISOString() : null,
        // "Save & mark done": pending stays selectable in the dialog, but the
        // primary save action for a pending milestone marks it done.
        status: editStatus === "pending" ? "done" : editStatus,
      }),
    onSuccess: () => {
      setUserPicked(true);
      setExpandedId(null);
      setEditError(null);
      invalidate();
    },
    onError: (err) => setEditError((err as Error).message),
  });

  /** Load a milestone's values into the inline form. */
  const seedForm = useCallback((m: Milestone) => {
    setEditTitle(m.title);
    setEditComment(m.comment ?? "");
    // Default the date to today when the milestone has none recorded.
    setEditDate(
      m.date ? format(new Date(m.date), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
    );
    setEditStatus(m.status);
    setEditError(null);
  }, []);

  // The next step still to do opens by default, so the timeline lands on the
  // thing you came to fill in. Once the user picks a row themselves (or saves),
  // that stops: the form should not jump around under them.
  const nextPending = milestones.find((m) => m.status === "pending") ?? null;
  useEffect(() => {
    if (userPicked || !nextPending) return;
    setExpandedId(nextPending.id);
    seedForm(nextPending);
    setUserPicked(true);
  }, [userPicked, nextPending, seedForm]);

  /** Open a milestone in place; clicking the open one closes it again. */
  function toggleExpand(m: Milestone) {
    setUserPicked(true);
    if (expandedId === m.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(m.id);
    seedForm(m);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Timeline</h2>

      <ol className="space-y-0" data-testid="milestone-timeline">
        {milestones.map((m, i) => {
          const isOpen = expandedId === m.id;
          return (
          <li key={m.id} className="group relative flex gap-4 pb-6">
            {/* Connector: solid between recorded steps, dashed into the
                "add milestone" row at the end of the timeline. */}
            <span
              aria-hidden
              className={cn(
                "absolute left-[7px] top-5 h-full w-px",
                i < milestones.length - 1
                  ? "bg-border"
                  : "border-l border-dashed border-border",
              )}
            />
            {/* The marker carries the state: a check for done, the skip icon
                for skipped, and a plain ring for what is still to do. It
                replaces the per-row status badge. */}
            <span
              aria-hidden
              data-testid="milestone-marker"
              className={cn(
                "relative mt-1.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                m.status === "done"
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : m.status === "skipped"
                    ? "border-muted-foreground/40 bg-muted text-muted-foreground"
                    : "border-muted-foreground/30 bg-background",
              )}
            >
              {m.status === "done" && <Check className="h-2.5 w-2.5" />}
              {m.status === "skipped" && <Minus className="h-2.5 w-2.5" />}
            </span>
            <div className="min-w-0 flex-1">
              {/* The milestone itself is the accordion header: it opens in
                  place instead of throwing a dialog over the timeline. */}
              <button
                type="button"
                onClick={() => toggleExpand(m)}
                aria-expanded={isOpen}
                aria-controls={`milestone-panel-${m.id}`}
                className="flex w-full cursor-pointer items-start gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.title}</span>
                    {m.date && (
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(m.date), "MMM d, yyyy")}
                      </span>
                    )}
                  </span>
                  {m.comment && !isOpen && (
                    <span className="block text-sm text-muted-foreground">
                      {m.comment}
                    </span>
                  )}
                </span>
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>

              {isOpen && (
                <div
                  id={`milestone-panel-${m.id}`}
                  className="mt-2 space-y-3 rounded-md border bg-card p-3"
                >
                  <div className="space-y-2">
                    <Label htmlFor={`m-title-${m.id}`}>Title</Label>
                    <Input
                      id={`m-title-${m.id}`}
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`m-status-${m.id}`}>Status</Label>
                    <Select
                      value={editStatus}
                      onValueChange={(v) =>
                        setEditStatus(v as Milestone["status"])
                      }
                    >
                      <SelectTrigger id={`m-status-${m.id}`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["pending", "done", "skipped"] as const).map((st) => {
                          const Icon = MILESTONE_STATUS_ICONS[st];
                          return (
                            <SelectItem key={st} value={st} className="capitalize">
                              <Icon className="mr-2 h-4 w-4" />
                              {st}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`m-date-${m.id}`}>Date</Label>
                    <Input
                      id={`m-date-${m.id}`}
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`m-comment-${m.id}`}>Comment</Label>
                    <Textarea
                      id={`m-comment-${m.id}`}
                      rows={3}
                      value={editComment}
                      onChange={(e) => setEditComment(e.target.value)}
                    />
                  </div>

                  {editError && (
                    <p role="alert" className="text-sm text-destructive-readable">
                      {editError}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => saveEdit.mutate()}
                      disabled={saveEdit.isPending || !editTitle.trim()}
                    >
                      <Save />
                      {saveEdit.isPending
                        ? "Saving…"
                        : editStatus === "pending"
                          ? "Save & mark done"
                          : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedId(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto text-destructive-readable hover:text-destructive-readable"
                      onClick={() => setConfirmDelete(m)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 />
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </li>
          );
        })}

        {/* The end of the timeline: a dashed node on the connector, then the
            action itself as a bordered secondary button carrying the +. */}
        <li className="relative flex items-center gap-4" data-testid="timeline-add">
          <span
            aria-hidden
            className="flex h-3.5 w-3.5 shrink-0 rounded-full border-2 border-dashed border-muted-foreground/40 bg-background"
          />
          <Button
            variant="outline"
            size="sm"
            // bg-card: outline's default fill is the page colour, which left it
            // reading as disabled text with a border on the grey page.
            className="bg-card"
            onClick={() => setAddOpen(true)}
          >
            <Plus />
            Add milestone
          </Button>
        </li>
      </ol>

      <AddMilestoneModal
        appId={appId}
        milestones={milestones}
        open={addOpen}
        onOpenChange={setAddOpen}
      />

      {/* Delete milestone confirm */}
      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title={confirmDelete ? `Remove "${confirmDelete.title}"?` : "Remove milestone?"}
        description="It will be removed from the timeline and later steps shift up."
        confirmLabel="Delete"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (confirmDelete) {
            deleteMutation.mutate(confirmDelete.id);
          }
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}
