"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Save, X } from "lucide-react";
import {
  updateApplication,
  ApiClientError,
  type ApplicationDetail,
} from "@/lib/api";
import type { ApplicationStatus } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
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

interface FormState {
  company: string;
  role: string;
  url: string;
  companyWebsite: string;
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
    companyWebsite: f.companyWebsite || null,
    contactName: f.contactName || null,
    contactEmail: f.contactEmail || null,
    contactPhone: f.contactPhone || null,
    notes: f.notes || null,
    status: f.status,
  };
}

function fromApp(app: ApplicationDetail): FormState {
  return {
    company: app.company,
    role: app.role,
    url: app.url ?? "",
    companyWebsite: app.companyWebsite ?? "",
    contactName: app.contactName ?? "",
    contactEmail: app.contactEmail ?? "",
    contactPhone: app.contactPhone ?? "",
    notes: app.notes ?? "",
    status: app.status,
  };
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function EditApplicationForm({ app }: { app: ApplicationDetail }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => fromApp(app));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["application", app.id] });
    qc.invalidateQueries({ queryKey: ["applications"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  };

  // Sync from the server only when the user has no unsaved changes.
  useEffect(() => {
    if (dirty) return;
    setForm(fromApp(app));
  }, [app, dirty]);

  function onChange(patch: Partial<FormState>) {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateApplication(app.id, snapshot(form));
      setDirty(false);
      invalidate();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Failed to save changes",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setForm(fromApp(app));
    setDirty(false);
    setError(null);
  }

  return (
    <Card className="bg-gradient-to-br from-card to-violet-100/40 dark:to-violet-950/40">
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field id="edit-company" label="Company">
          <Input
            id="edit-company"
            value={form.company}
            onChange={(e) => onChange({ company: e.target.value })}
          />
        </Field>
        <Field id="edit-role" label="Role">
          <Input
            id="edit-role"
            value={form.role}
            onChange={(e) => onChange({ role: e.target.value })}
          />
        </Field>
        <Field id="edit-url" label="Job posting URL">
          <Input
            id="edit-url"
            type="url"
            value={form.url}
            onChange={(e) => onChange({ url: e.target.value })}
          />
        </Field>
        <div className="space-y-2">
          {/* Not `type="url"`: a bare domain is the expected input here, and
              the browser would refuse to submit "stripe.com". */}
          <Label htmlFor="edit-company-website">Company website</Label>
          <Input
            id="edit-company-website"
            inputMode="url"
            autoComplete="url"
            value={form.companyWebsite}
            onChange={(e) => onChange({ companyWebsite: e.target.value })}
            placeholder="https://…"
          />
          <p className="text-xs text-muted-foreground">
            Used for the company logo when the posting link is a job board.
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Contact
          </p>
          <Field id="edit-contact-name" label="Name">
            <Input
              id="edit-contact-name"
              value={form.contactName}
              onChange={(e) => onChange({ contactName: e.target.value })}
            />
          </Field>
          <Field id="edit-contact-email" label="Email">
            <Input
              id="edit-contact-email"
              type="email"
              value={form.contactEmail}
              onChange={(e) => onChange({ contactEmail: e.target.value })}
            />
          </Field>
          <Field id="edit-contact-phone" label="Phone">
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

        <Field id="edit-notes" label="Notes">
          <Textarea
            id="edit-notes"
            rows={4}
            value={form.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
          />
        </Field>

        <div className="space-y-2">
          <Label htmlFor="edit-status">Status</Label>
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
                  <StatusIcon status={s} className="mr-2 h-4 w-4" />
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

        {dirty && (
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              <Save />
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={saving}
            >
              <X />
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
