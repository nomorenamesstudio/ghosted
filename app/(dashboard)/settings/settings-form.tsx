"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Download, KeyRound, Moon, Sun, Trash2, UserRound } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { ConfirmDialog } from "@/components/ConfirmDialog";
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

function Message({
  state,
}: {
  state: { type: "ok" | "error"; text: string } | null;
}) {
  if (!state) return null;
  return (
    <p
      role={state.type === "error" ? "alert" : "status"}
      className={
        state.type === "error"
          ? "text-sm text-destructive"
          : "text-sm text-emerald-600 dark:text-emerald-400"
      }
    >
      {state.text}
    </p>
  );
}

export function SettingsForm({
  name: initialName,
  email: initialEmail,
}: {
  name: string;
  email: string;
}) {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const { theme, setTheme } = useTheme();

  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [profileMsg, setProfileMsg] = useState<{
    type: "ok" | "error";
    text: string;
  } | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<{
    type: "ok" | "error";
    text: string;
  } | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileBusy(true);
    setProfileMsg(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name === initialName ? undefined : name,
          email: email === initialEmail ? undefined : email,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to update profile");
      }
      // Keep the session cookie in sync, then re-render the server layout.
      await updateSession({ name, email } as never);
      router.refresh();
      setProfileMsg({ type: "ok", text: "Profile updated." });
    } catch (err) {
      setProfileMsg({ type: "error", text: (err as Error).message });
    } finally {
      setProfileBusy(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordBusy(true);
    setPasswordMsg(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to change password");
      }
      setCurrentPassword("");
      setNewPassword("");
      setPasswordMsg({ type: "ok", text: "Password updated." });
    } catch (err) {
      setPasswordMsg({ type: "error", text: (err as Error).message });
    } finally {
      setPasswordBusy(false);
    }
  }

  async function confirmDeleteAccount() {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/auth/account", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to delete account");
      }
      await signOut({ redirect: false });
      router.push("/login");
      router.refresh();
    } catch (err) {
      setDeleteBusy(false);
      setDeleteError((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Night mode defaults to your system preference; the switch remembers
            your choice.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
            {theme === "dark" ? "Light mode" : "Night mode"}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={theme === "dark"}
            aria-label="Toggle night mode"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className={[
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              theme === "dark" ? "bg-primary" : "bg-input",
            ].join(" ")}
            data-testid="theme-switch"
          >
            <span
              className={[
                "inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform",
                theme === "dark" ? "translate-x-5" : "translate-x-0.5",
              ].join(" ")}
            />
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="h-4 w-4" />
            Profile
          </CardTitle>
          <CardDescription>
            Update your display name and sign-in email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="settings-name">Name</Label>
              <Input
                id="settings-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-email">Email</Label>
              <Input
                id="settings-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Message state={profileMsg} />
            <Button type="submit" disabled={profileBusy}>
              {profileBusy ? "Saving…" : "Save profile"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Password
          </CardTitle>
          <CardDescription>
            Change the password used to sign in with email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="settings-current-password">Current password</Label>
              <Input
                id="settings-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-new-password">New password</Label>
              <Input
                id="settings-new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <Message state={passwordMsg} />
            <Button type="submit" disabled={passwordBusy}>
              {passwordBusy ? "Updating…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
          <CardDescription>
            Export a copy of everything you have stored, or delete your
            account permanently (GDPR rights to data portability and erasure).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" asChild>
            <a href="/api/auth/export">
              <Download />
              Export my data
            </a>
          </Button>

          <div className="border-t pt-4">
            {deleteError && (
              <p role="alert" className="mb-2 text-sm text-destructive">
                {deleteError}
              </p>
            )}
            <Button
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 />
              Delete account
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              This permanently deletes your account and all applications,
              milestones and notes — including archived ones. It cannot be
              undone.
            </p>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete account permanently?"
        description="All of your applications, milestones and notes will be erased. This cannot be undone."
        confirmLabel="Delete account"
        destructive
        loading={deleteBusy}
        onConfirm={confirmDeleteAccount}
      />
    </div>
  );
}
