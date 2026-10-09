"use client";

import { useState } from "react";
import { KeyRound, Save, X } from "lucide-react";
import { Message, type Msg } from "@/components/FormMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The password card, in the two shapes an account can be in.
 *
 * An account created by Google or LinkedIn has no password at all, and one that
 * a provider adopted while its email was unverified had its password dropped
 * (see the adopt rule in lib/services/oauth-accounts.ts). Both used to be dead
 * ends — `change-password` needs a current password to compare, and the reset
 * flow only issues a token for an account that has one — so the card offers to
 * *set* the first password instead, which routes to `/api/auth/set-password`.
 */
export function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMsg(null);
    if (newPassword !== confirmPassword) {
      setMsg({ type: "error", text: "Passwords do not match." });
      return;
    }
    if (newPassword.length < 8) {
      setMsg({
        type: "error",
        text: `${hasPassword ? "New password" : "Password"} must be at least 8 characters.`,
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        hasPassword ? "/api/auth/change-password" : "/api/auth/set-password",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            hasPassword
              ? { currentPassword, newPassword, confirmPassword }
              : { newPassword, confirmPassword },
          ),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error ??
            (hasPassword ? "Failed to change password" : "Failed to set password"),
        );
      }
      setOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setUpdated(true);
    } catch (err) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          Password
        </CardTitle>
        <CardDescription>
          {hasPassword
            ? "Change the password used to sign in with email."
            : "This account signs in with Google or LinkedIn. Set a password to sign in with email as well."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" onClick={() => setOpen(true)}>
          <KeyRound />
          {hasPassword ? "Change password" : "Set a password"}
        </Button>
        {updated && (
          <Message
            state={{
              type: "ok",
              text: hasPassword
                ? "Password updated."
                : "Password saved — you can sign in with email now.",
            }}
          />
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hasPassword ? "Change password" : "Set a password"}</DialogTitle>
            <DialogDescription>
              {hasPassword
                ? "Choose a new password (at least 8 characters)."
                : "Choose a password (at least 8 characters) to sign in with email as well."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {hasPassword && (
              <div className="space-y-2">
                <Label htmlFor="pw-current">Current password</Label>
                <Input
                  id="pw-current"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="pw-new">New password</Label>
              <Input
                id="pw-new"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw-confirm">Confirm new password</Label>
              <Input
                id="pw-confirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <Message state={msg} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                <X />
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                <Save />
                {busy
                  ? hasPassword
                    ? "Updating…"
                    : "Saving…"
                  : hasPassword
                    ? "Update password"
                    : "Save password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
