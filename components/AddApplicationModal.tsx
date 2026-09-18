"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import {
  createApplication,
  ApiClientError,
} from "@/lib/api";
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

  const mutation = useMutation({
    mutationFn: createApplication,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setCompany("");
      setRole("");
      setUrl("");
      setCompanyWebsite("");
      setNotes("");
      setError(null);
      onOpenChange(false);
    },
    onError: (err) => {
      setError(
        err instanceof ApiClientError ? err.message : "Failed to create application",
      );
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate({
      company,
      role,
      url: url || null,
      companyWebsite: companyWebsite || null,
      notes: notes || null,
    });
  }

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
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme Corp"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-role">Role *</Label>
            <RoleInput
              id="add-role"
              required
              value={role}
              onChange={setRole}
              placeholder="Senior Frontend Engineer"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-url">Job posting URL</Label>
            <Input
              id="add-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
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
              onChange={(e) => setCompanyWebsite(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-notes">Notes</Label>
            <Textarea
              id="add-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything to remember…"
            />
          </div>
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
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                "Saving…"
              ) : (
                <>
                  <Plus />
                  Add application
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
