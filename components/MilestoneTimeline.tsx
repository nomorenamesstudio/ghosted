"use client";

import { useState } from "react";
import { format } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, MoreVertical, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  deleteMilestone,
  updateMilestone,
  type ApplicationDetail,
} from "@/lib/api";
import type { Milestone } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddMilestoneModal } from "./AddMilestoneModal";
import { ConfirmDialog } from "./ConfirmDialog";

function statusVariant(
  status: Milestone["status"],
): "success" | "muted" | "outline" {
  if (status === "done") return "success";
  if (status === "skipped") return "muted";
  return "outline";
}

export function MilestoneTimeline({
  appId,
  milestones,
}: {
  appId: string;
  milestones: Milestone[];
}) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Milestone | null>(null);
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

  const toggleStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: Milestone["status"] }) =>
      updateMilestone(id, { status: next }),
    // Optimistic update.
    onMutate: async ({ id, next }) => {
      await qc.cancelQueries({ queryKey: ["application", appId] });
      const previous = qc.getQueryData(["application", appId]);
      qc.setQueryData(["application", appId], (old?: { data: ApplicationDetail }) =>
        old
          ? {
              ...old,
              data: {
                ...old.data,
                milestones: old.data.milestones.map((m) =>
                  m.id === id ? { ...m, status: next } : m,
                ),
              },
            }
          : old,
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(["application", appId], ctx.previous);
      }
    },
    onSettled: () => invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMilestone(id),
    onSuccess: () => invalidate(),
  });

  const saveEdit = useMutation({
    mutationFn: () =>
      updateMilestone(editing!.id, {
        title: editTitle,
        comment: editComment || null,
        date: editDate ? new Date(editDate).toISOString() : null,
        // "Save & mark done": pending stays selectable in the dialog, but the
        // primary save action for a pending milestone marks it done.
        status: editStatus === "pending" ? "done" : editStatus,
      }),
    onSuccess: () => {
      setEditing(null);
      setEditError(null);
      invalidate();
    },
    onError: (err) => setEditError((err as Error).message),
  });

  function openEdit(m: Milestone) {
    setEditing(m);
    setEditTitle(m.title);
    setEditComment(m.comment ?? "");
    setEditDate(m.date ? format(new Date(m.date), "yyyy-MM-dd") : "");
    setEditStatus(m.status);
    setEditError(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Timeline</h2>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus />
          Add milestone
        </Button>
      </div>

      <ol className="space-y-0" data-testid="milestone-timeline">
        {milestones.map((m, i) => (
          <li key={m.id} className="group relative flex gap-4 pb-6">
            {/* Connector line */}
            {i < milestones.length - 1 && (
              <span
                aria-hidden
                className="absolute left-[7px] top-5 h-full w-px bg-border"
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2",
                m.status === "done"
                  ? "border-emerald-500 bg-emerald-500"
                  : m.status === "skipped"
                    ? "border-muted-foreground/40 bg-muted"
                    : "border-muted-foreground/40 bg-background",
              )}
            />
            {/* Clicking the milestone opens the edit dialog. */}
            <button
              type="button"
              onClick={() => openEdit(m)}
              className="min-w-0 flex-1 cursor-pointer space-y-1 rounded-md text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label={`Edit ${m.title}`}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{m.title}</span>
                <Badge variant={statusVariant(m.status)}>{m.status}</Badge>
                {m.date && (
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(m.date), "MMM d, yyyy")}
                  </span>
                )}
              </span>
              {m.comment && (
                <span className="block text-sm text-muted-foreground">
                  {m.comment}
                </span>
              )}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={`Actions for ${m.title}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {m.status !== "done" ? (
                  <DropdownMenuItem
                    onSelect={() => toggleStatus.mutate({ id: m.id, next: "done" })}
                    disabled={toggleStatus.isPending}
                  >
                    <Check />
                    Mark done
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onSelect={() =>
                      toggleStatus.mutate({ id: m.id, next: "pending" })
                    }
                    disabled={toggleStatus.isPending}
                  >
                    <RotateCcw />
                    Reopen
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => openEdit(m)}>
                  <Pencil />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setConfirmDelete(m)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
      </ol>

      <AddMilestoneModal
        appId={appId}
        milestones={milestones}
        open={addOpen}
        onOpenChange={setAddOpen}
      />

      {/* Edit milestone dialog */}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit milestone</DialogTitle>
            <DialogDescription>
              Update the step, then save — a pending milestone is marked done
              on save.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-m-title">Title</Label>
              <Input
                id="edit-m-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-m-status">Status</Label>
              <select
                id="edit-m-status"
                value={editStatus}
                onChange={(e) =>
                  setEditStatus(e.target.value as Milestone["status"])
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="pending">Pending</option>
                <option value="done">Done</option>
                <option value="skipped">Skipped</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-m-date">Date</Label>
              <Input
                id="edit-m-date"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-m-comment">Comment</Label>
              <Textarea
                id="edit-m-comment"
                rows={3}
                value={editComment}
                onChange={(e) => setEditComment(e.target.value)}
              />
            </div>
            {editError && (
              <p role="alert" className="text-sm text-destructive">
                {editError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveEdit.mutate()}
              disabled={saveEdit.isPending || !editTitle.trim()}
            >
              {editStatus === "pending" ? "Save & mark done" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
