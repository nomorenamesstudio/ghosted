"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, X } from "lucide-react";
import {
  createApplication,
  matchApplications,
  ApiClientError,
  type ApplicationCandidates,
} from "@/lib/api";
import { STATUS_TITLES } from "@/lib/utils/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RoleInput } from "./RoleInput";
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

export function AddApplicationModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [url, setUrl] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  /**
   * What the pre-flight found. Holding it replaces the submit button with a
   * notice and two choices, so a slip of the mouse costs a click instead of a
   * duplicate — and a real reapplication is still one click away.
   */
  const [existing, setExisting] = useState<ApplicationCandidates | null>(null);
  const [checking, setChecking] = useState(false);

  const mutation = useMutation({
    mutationFn: createApplication,
    onSuccess: ({ data }) => {
      // Only the section the new application landed in can have changed: a
      // brand-new row is not stale, so it cannot appear in "ghosted" as well,
      // and the other columns still hold exactly what they held before.
      qc.invalidateQueries({
        queryKey: ["applications", "section", data.status],
      });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setCompany("");
      setRole("");
      setUrl("");
      setCompanyWebsite("");
      setNotes("");
      setError(null);
      setExisting(null);
      onOpenChange(false);
    },
    onError: (err) => {
      setError(
        err instanceof ApiClientError ? err.message : "Failed to create application",
      );
    },
  });

  function create() {
    mutation.mutate({
      company,
      role,
      url: url || null,
      companyWebsite: companyWebsite || null,
      notes: notes || null,
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (existing) {
      // Second press, after the user has seen the notice and chosen to go on.
      create();
      return;
    }
    setChecking(true);
    try {
      const { data } = await matchApplications({
        company,
        role,
        url: url || null,
      });
      if (data.verdict === "none") {
        create();
        return;
      }
      setExisting(data);
    } catch (err) {
      // A failed check is not a reason to refuse the write: say so and go on.
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not check for duplicates — try again.",
      );
    } finally {
      setChecking(false);
    }
  }

  /** Editing the form after a notice invalidates it: the next press re-checks. */
  function change(setter: (value: string) => void) {
    return (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setter(event.target.value);
      setExisting(null);
    };
  }

  const first = existing?.matches[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add application</DialogTitle>
          <DialogDescription>
            A 5-step timeline will be created automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="add-company">Company *</Label>
            <Input
              id="add-company"
              required
              value={company}
              onChange={change(setCompany)}
              placeholder="Acme Corp"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-role">Role *</Label>
            <RoleInput
              id="add-role"
              required
              value={role}
              onChange={(value) => {
                setRole(value);
                setExisting(null);
              }}
              placeholder="Senior Frontend Engineer"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-url">Job posting URL</Label>
            <Input
              id="add-url"
              type="url"
              value={url}
              onChange={change(setUrl)}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-company-website">Company website</Label>
            <Input
              id="add-company-website"
              inputMode="url"
              autoComplete="url"
              value={companyWebsite}
              onChange={change(setCompanyWebsite)}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-notes">Notes</Label>
            <Textarea
              id="add-notes"
              value={notes}
              onChange={change(setNotes)}
              placeholder="Anything to remember…"
            />
          </div>
          {existing && first ? (
            <div
              role="status"
              className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
            >
              <p className="flex items-start gap-2">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden
                />
                <span>
                  <strong>
                    {first.company} — {first.role}
                  </strong>{" "}
                  is already on your board (
                  {STATUS_TITLES[first.status].toLowerCase()}).
                  {existing.verdict === "closed"
                    ? " Filing it again is fine — that is a reapplication."
                    : " Open it, or file a second one anyway."}
                  {existing.matches.length > 1
                    ? ` ${existing.matches.length - 1} more like it are there too.`
                    : null}
                </span>
              </p>
              <div className="flex flex-wrap gap-2 pl-6">
                <Button
                  variant={existing.verdict === "closed" ? "outline" : "default"}
                  size="sm"
                  asChild
                >
                  <Link
                    href={`/applications/${first.id}`}
                    onClick={() => onOpenChange(false)}
                  >
                    {existing.verdict === "closed" ? "Open the old one" : "Open it"}
                  </Link>
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  variant={existing.verdict === "closed" ? "default" : "outline"}
                  disabled={mutation.isPending}
                >
                  {mutation.isPending
                    ? "Saving…"
                    : existing.verdict === "closed"
                      ? "File it again"
                      : "File a second one anyway"}
                </Button>
              </div>
            </div>
          ) : null}
          {error && (
            <p role="alert" className="text-sm text-destructive-readable">
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
            {existing ? null : (
              <Button type="submit" disabled={mutation.isPending || checking}>
                {mutation.isPending || checking ? (
                  "Saving…"
                ) : (
                  <>
                    <Plus />
                    Add application
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
