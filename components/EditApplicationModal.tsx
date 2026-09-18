"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Save, X } from "lucide-react";
import {
  updateApplication,
  type ApplicationDetail,
} from "@/lib/api";
import { ApiClientError } from "@/lib/api";
import type { ApplicationStatus } from "@/lib/db/schema";
import { STATUS_ORDER, STATUS_TITLES } from "@/lib/utils/status";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RoleInput } from "./RoleInput";
import { StatusIcon } from "./status-icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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

/** The details form, in a modal — the card on the page is read-only. */
export function EditApplicationModal({
  app,
  open,
  onOpenChange,
}: {
  app: ApplicationDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => fromApp(app));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reopening always starts from what the server holds.
  useEffect(() => {
    if (open) {
      setForm(fromApp(app));
      setError(null);
    }
  }, [open, app]);

  function onChange(patch: Partial<FormState>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateApplication(app.id, snapshot(form));
      const qcInvalidate = () => {
        qc.invalidateQueries({ queryKey: ["application", app.id] });
        qc.invalidateQueries({ queryKey: ["applications"] });
        qc.invalidateQueries({ queryKey: ["stats"] });
        // A new role title should show up in the autocomplete next time.
        qc.invalidateQueries({ queryKey: ["roles"] });
      };
      qcInvalidate();
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Failed to save changes",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit application</DialogTitle>
          <DialogDescription>
            Company, posting, contacts and notes. Progress lives on the
            timeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
            <RoleInput
              id="edit-role"
              value={form.role}
              onChange={(role) => onChange({ role })}
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

          <div className="space-y-3 border-t pt-4">
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
          </div>

          <div className="space-y-2 border-t pt-4">
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
            <Select
              value={form.status}
              onValueChange={(v) => onChange({ status: v as ApplicationStatus })}
            >
              <SelectTrigger id="edit-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    <StatusIcon status={s} className="mr-2 h-4 w-4" />
                    {STATUS_TITLES[s]}
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
            <p role="alert" className="text-sm text-destructive-readable">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            <X />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save />
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
