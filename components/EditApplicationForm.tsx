"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import {
  updateApplication,
  ApiClientError,
  type ApplicationDetail,
} from "@/lib/api";
import type { ApplicationStatus } from "@/lib/db/schema";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STATUS_OPTIONS: ApplicationStatus[] = [
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "archived",
];

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const AUTOSAVE_DEBOUNCE_MS = 800;

interface FormState {
  company: string;
  role: string;
  url: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
  status: ApplicationStatus;
}

function snapshot(f: FormState) {
  return {
    company: f.company,
    role: f.role,
    url: f.url || null,
    contactName: f.contactName || null,
    contactEmail: f.contactEmail || null,
    contactPhone: f.contactPhone || null,
    notes: f.notes || null,
    status: f.status,
  };
}

export function EditApplicationForm({ app }: { app: ApplicationDetail }) {
  const qc = useQueryClient();

  const [form, setForm] = useState<FormState>({
    company: app.company,
    role: app.role,
    url: app.url ?? "",
    contactName: app.contactName ?? "",
    contactEmail: app.contactEmail ?? "",
    contactPhone: app.contactPhone ?? "",
    notes: app.notes ?? "",
    status: app.status,
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  // Latest-form ref so debounced/flush saves always send the newest values.
  const formRef = useRef(form);
  formRef.current = form;
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const resaveRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["application", app.id] });
    qc.invalidateQueries({ queryKey: ["applications"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  }, [qc, app.id]);

  const doSave = useCallback(async () => {
    if (savingRef.current) {
      resaveRef.current = true;
      return;
    }
    savingRef.current = true;
    setSaveState("saving");
    try {
      await updateApplication(app.id, snapshot(formRef.current));
      savingRef.current = false;
      dirtyRef.current = false;
      setSaveState("saved");
      setError(null);
      invalidate();
      if (resaveRef.current) {
        resaveRef.current = false;
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          void doSave();
        }, 0);
      }
    } catch (err) {
      savingRef.current = false;
      setSaveState("error");
      setError(
        err instanceof ApiClientError ? err.message : "Failed to save changes",
      );
    }
  }, [app.id, invalidate]);

  const scheduleSave = useCallback(
    (ms: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void doSave();
      }, ms);
    },
    [doSave],
  );

  function onChange(patch: Partial<FormState>) {
    setForm((f) => ({ ...f, ...patch }));
    dirtyRef.current = true;
    setSaveState("dirty");
    scheduleSave(AUTOSAVE_DEBOUNCE_MS);
  }

  // Sync from the server only when the user has no unsaved edits.
  useEffect(() => {
    if (dirtyRef.current) return;
    setForm({
      company: app.company,
      role: app.role,
      url: app.url ?? "",
      contactName: app.contactName ?? "",
      contactEmail: app.contactEmail ?? "",
      contactPhone: app.contactPhone ?? "",
      notes: app.notes ?? "",
      status: app.status,
    });
  }, [app]);

  // Flush pending edits when leaving the page.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dirtyRef.current && !savingRef.current) {
        void updateApplication(app.id, snapshot(formRef.current)).catch(
          () => {},
        );
      }
    };
  }, [app.id]);

  const saveLabel =
    saveState === "saving" ? (
      <>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Saving…
      </>
    ) : saveState === "saved" ? (
      <>
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        Saved
      </>
    ) : saveState === "dirty" ? (
      "Unsaved changes…"
    ) : saveState === "error" ? (
      <>
        <TriangleAlert className="h-3.5 w-3.5" />
        Save failed
      </>
    ) : null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            Changes are saved automatically as you type.
          </CardDescription>
        </div>
        {saveLabel && (
          <span
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
            data-testid="autosave-status"
            role="status"
          >
            {saveLabel}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="edit-company">Company</Label>
          <Input
            id="edit-company"
            value={form.company}
            onChange={(e) => onChange({ company: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-role">Role</Label>
          <Input
            id="edit-role"
            value={form.role}
            onChange={(e) => onChange({ role: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-url">Job posting URL</Label>
          <Input
            id="edit-url"
            type="url"
            value={form.url}
            onChange={(e) => onChange({ url: e.target.value })}
          />
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Contact
          </p>
          <div className="space-y-2">
            <Label htmlFor="edit-contact-name">Name</Label>
            <Input
              id="edit-contact-name"
              value={form.contactName}
              onChange={(e) => onChange({ contactName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-contact-email">Email</Label>
            <Input
              id="edit-contact-email"
              type="email"
              value={form.contactEmail}
              onChange={(e) => onChange({ contactEmail: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-contact-phone">Phone</Label>
            <Input
              id="edit-contact-phone"
              type="tel"
              value={form.contactPhone}
              onChange={(e) => onChange({ contactPhone: e.target.value })}
            />
          </div>
          {/* Divider: the title separates enough, the line closes the block. */}
          <div className="border-t" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-notes">Notes</Label>
          <Textarea
            id="edit-notes"
            rows={4}
            value={form.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-status">Status</Label>
          <select
            id="edit-status"
            value={form.status}
            onChange={(e) =>
              onChange({ status: e.target.value as ApplicationStatus })
            }
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Applied / interviewing / offer are derived from your milestones
            (all done → offer, 2+ done → interviewing); rejected &amp;
            archived are manual.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
