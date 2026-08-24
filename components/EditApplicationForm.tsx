"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
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

export function EditApplicationForm({ app }: { app: ApplicationDetail }) {
  const qc = useQueryClient();
  const [company, setCompany] = useState(app.company);
  const [role, setRole] = useState(app.role);
  const [url, setUrl] = useState(app.url ?? "");
  const [contactName, setContactName] = useState(app.contactName ?? "");
  const [contactEmail, setContactEmail] = useState(app.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(app.contactPhone ?? "");
  const [notes, setNotes] = useState(app.notes ?? "");
  const [status, setStatus] = useState<ApplicationStatus>(app.status);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Keep local state in sync when the app data refetches.
  useEffect(() => {
    setCompany(app.company);
    setRole(app.role);
    setUrl(app.url ?? "");
    setContactName(app.contactName ?? "");
    setContactEmail(app.contactEmail ?? "");
    setContactPhone(app.contactPhone ?? "");
    setNotes(app.notes ?? "");
    setStatus(app.status);
    setDirty(false);
  }, [app]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["application", app.id] });
    qc.invalidateQueries({ queryKey: ["applications"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  };

  const save = useMutation({
    mutationFn: () =>
      updateApplication(app.id, {
        company,
        role,
        url: url || null,
        contactName: contactName || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        notes: notes || null,
        status,
      }),
    onSuccess: () => {
      setError(null);
      setDirty(false);
      invalidate();
    },
    onError: (err) => {
      setError(
        err instanceof ApiClientError ? err.message : "Failed to save changes",
      );
    },
  });

  function markDirty() {
    setDirty(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
        <CardDescription>Edit application details.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="edit-company">Company</Label>
          <Input
            id="edit-company"
            value={company}
            onChange={(e) => {
              setCompany(e.target.value);
              markDirty();
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-role">Role</Label>
          <Input
            id="edit-role"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              markDirty();
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-url">Job posting URL</Label>
          <Input
            id="edit-url"
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              markDirty();
            }}
          />
        </div>

        <div className="space-y-3 rounded-md border p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Contact
          </p>
          <div className="space-y-2">
            <Label htmlFor="edit-contact-name">Name</Label>
            <Input
              id="edit-contact-name"
              value={contactName}
              onChange={(e) => {
                setContactName(e.target.value);
                markDirty();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-contact-email">Email</Label>
            <Input
              id="edit-contact-email"
              type="email"
              value={contactEmail}
              onChange={(e) => {
                setContactEmail(e.target.value);
                markDirty();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-contact-phone">Phone</Label>
            <Input
              id="edit-contact-phone"
              type="tel"
              value={contactPhone}
              onChange={(e) => {
                setContactPhone(e.target.value);
                markDirty();
              }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-notes">Notes</Label>
          <Textarea
            id="edit-notes"
            rows={4}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              markDirty();
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-status">Status</Label>
          <select
            id="edit-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ApplicationStatus);
              markDirty();
            }}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Applied / interviewing / offer are normally derived from your
            milestones; rejected &amp; archived are manual.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
          >
            <Save />
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
