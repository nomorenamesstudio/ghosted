"use client";

import { useState } from "react";
import { format } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  deleteMilestone,
  updateMilestone,
  type ApplicationDetail,
} from "@/lib/api";
import type { Milestone } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AddMilestoneModal } from "./AddMilestoneModal";

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
        status: editStatus,
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
          Add milestone
        </Button>
      </div>

      <ol className="space-y-0" data-testid="milestone-timeline">
        {milestones.map((m, i) => (
          <li key={m.id} className="relative flex gap-4 pb-6">
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
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{m.title}</span>
                <Badge variant={statusVariant(m.status)}>{m.status}</Badge>
                {m.date && (
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(m.date), "MMM d, yyyy")}
                  </span>
                )}
              </div>
              {m.comment && (
                <p className="text-sm text-muted-foreground">{m.comment}</p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {m.status !== "done" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => toggleStatus.mutate({ id: m.id, next: "done" })}
                    disabled={toggleStatus.isPending}
                  >
                    Mark done
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleStatus.mutate({ id: m.id, next: "pending" })}
                    disabled={toggleStatus.isPending}
                  >
                    Reopen
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openEdit(m)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    if (window.confirm(`Remove "${m.title}" from the timeline?`)) {
                      deleteMutation.mutate(m.id);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                >
                  Delete
                </Button>
              </div>
            </div>
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
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Edit ${editing.title}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
        >
          <div className="w-full max-w-md space-y-4 rounded-lg border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Edit milestone</h3>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="edit-m-title">
                Title
              </label>
              <input
                id="edit-m-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="edit-m-status">
                Status
              </label>
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
              <label className="text-sm font-medium" htmlFor="edit-m-date">
                Date
              </label>
              <input
                id="edit-m-date"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="edit-m-comment">
                Comment
              </label>
              <textarea
                id="edit-m-comment"
                rows={3}
                value={editComment}
                onChange={(e) => setEditComment(e.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              />
            </div>
            {editError && (
              <p role="alert" className="text-sm text-destructive">
                {editError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => saveEdit.mutate()}
                disabled={saveEdit.isPending || !editTitle.trim()}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
