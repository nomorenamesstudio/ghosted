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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusIcon } from "./status-icons";

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

type FormField = keyof FormState;

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

/** Small save-state indicator shown next to the last-edited field's label. */
function SaveStatus({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-600">
        <CheckCircle2 className="h-3 w-3" />
        Saved
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <TriangleAlert className="h-3 w-3" />
        Save failed
      </span>
    );
  }
  return null;
}

function Field({
  id,
  label,
  status,
  children,
}: {
  id: string;
  label: string;
  status?: SaveState;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <SaveStatus state={status ?? "idle"} />
      </div>
      {children}
    </div>
  );
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
  const [lastEdited, setLastEdited] = useState<FormField | null>(null);

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
    setLastEdited(Object.keys(patch)[0] as FormField);
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

  const statusFor = (field: FormField): SaveState | undefined =>
    lastEdited === field ? saveState : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field id="edit-company" label="Company" status={statusFor("company")}>
          <Input
            id="edit-company"
            value={form.company}
            onChange={(e) => onChange({ company: e.target.value })}
          />
        </Field>
        <Field id="edit-role" label="Role" status={statusFor("role")}>
          <Input
            id="edit-role"
            value={form.role}
            onChange={(e) => onChange({ role: e.target.value })}
          />
        </Field>
        <Field id="edit-url" label="Job posting URL" status={statusFor("url")}>
          <Input
            id="edit-url"
            type="url"
            value={form.url}
            onChange={(e) => onChange({ url: e.target.value })}
          />
        </Field>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Contact
          </p>
          <Field
            id="edit-contact-name"
            label="Name"
            status={statusFor("contactName")}
          >
            <Input
              id="edit-contact-name"
              value={form.contactName}
              onChange={(e) => onChange({ contactName: e.target.value })}
            />
          </Field>
          <Field
            id="edit-contact-email"
            label="Email"
            status={statusFor("contactEmail")}
          >
            <Input
              id="edit-contact-email"
              type="email"
              value={form.contactEmail}
              onChange={(e) => onChange({ contactEmail: e.target.value })}
            />
          </Field>
          <Field
            id="edit-contact-phone"
            label="Phone"
            status={statusFor("contactPhone")}
          >
            <Input
              id="edit-contact-phone"
              type="tel"
              value={form.contactPhone}
              onChange={(e) => onChange({ contactPhone: e.target.value })}
            />
          </Field>
          {/* Divider: the title separates enough, the line closes the block. */}
          <div className="border-t" />
        </div>

        <Field id="edit-notes" label="Notes" status={statusFor("notes")}>
          <Textarea
            id="edit-notes"
            rows={4}
            value={form.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
          />
        </Field>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="edit-status">Status</Label>
            <SaveStatus state={statusFor("status") ?? "idle"} />
          </div>
          <Select
            value={form.status}
            onValueChange={(v) => onChange({ status: v as ApplicationStatus })}
          >
            <SelectTrigger id="edit-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  <StatusIcon status={s} className="h-4 w-4" />
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
