"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  BadgeCheck,
  Database,
  Download,
  FaceAngry,
  FaceGrinning,
  FaceSlightlySmiling,
  Hourglass,
  KeyRound,
  Mail,
  Moon,
  Palette,
  Save,
  Sun,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PatienceLevel } from "@/lib/db/schema";
import {
  PATIENCE_LABELS,
  PATIENCE_LEVELS,
} from "@/lib/utils/status";
import { useTheme } from "@/components/theme-provider";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
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

type Msg = { type: "ok" | "error"; text: string } | null;

function Message({ state }: { state: Msg }) {
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

/**
 * One face per patience level - the friendlier the face, the longer the app
 * waits before it is called ghosted.
 */
const PATIENCE_ICONS: Record<PatienceLevel, LucideIcon> = {
  generous: FaceGrinning,
  realistic: FaceSlightlySmiling,
  impatient: FaceAngry,
};

export function SettingsForm({
  name: initialName,
  email: initialEmail,
  emailVerified,
  patienceLevel: initialPatience,
  canDeleteAccount,
}: {
  name: string;
  email: string;
  emailVerified: boolean;
  patienceLevel: PatienceLevel;
  /**
   * False on an instance with registration closed: the account being deleted is
   * the only account, so the instance would be locked out for good. The API
   * route refuses it too — this only keeps the button from being an offer the
   * server will not honour.
   */
  canDeleteAccount: boolean;
}) {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const { theme, setTheme } = useTheme();

  // Profile - Save/Cancel only appear once something changed (details-page
  // pattern). "saved*" is the last persisted state, "name/email" the draft.
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [savedName, setSavedName] = useState(initialName);
  const [savedEmail, setSavedEmail] = useState(initialEmail);
  const dirty = name !== savedName || email !== savedEmail;
  const [profileMsg, setProfileMsg] = useState<Msg>(null);
  const [profileBusy, setProfileBusy] = useState(false);

  // Password change modal.
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwMsg, setPwMsg] = useState<Msg>(null);
  const [pwBusy, setPwBusy] = useState(false);

  // Import modal: a file, and one honest question about what it replaces.
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importReplace, setImportReplace] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<Msg>(null);
  const [pwUpdated, setPwUpdated] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Verification resend.
  const [resendBusy, setResendBusy] = useState(false);

  // Patience level — a single choice, so it saves on change (like the theme
  // switch) rather than needing a Save button.
  const [patience, setPatience] = useState<PatienceLevel>(initialPatience);
  const [patienceBusy, setPatienceBusy] = useState(false);
  const [patienceMsg, setPatienceMsg] = useState<Msg>(null);

  async function savePatience(next: PatienceLevel) {
    const previous = patience;
    setPatience(next);
    setPatienceBusy(true);
    setPatienceMsg(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patienceLevel: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to save patience level");
      }
      // The dashboard derives ghosted from this, so drop its cached data.
      router.refresh();
      setPatienceMsg({ type: "ok", text: "Patience level updated." });
    } catch (err) {
      setPatience(previous);
      setPatienceMsg({ type: "error", text: (err as Error).message });
    } finally {
      setPatienceBusy(false);
    }
  }

  async function resendVerification() {
    setResendBusy(true);
    setProfileMsg(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to send verification email");
      }
      setProfileMsg({
        type: "ok",
        text: "Verification email sent - check your inbox.",
      });
    } catch (err) {
      setProfileMsg({ type: "error", text: (err as Error).message });
    } finally {
      setResendBusy(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileBusy(true);
    setProfileMsg(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name === savedName ? undefined : name,
          email: email === savedEmail ? undefined : email,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to update profile");
      }
      setSavedName(name);
      setSavedEmail(email);
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

  function cancelProfile() {
    setName(savedName);
    setEmail(savedEmail);
    setProfileMsg(null);
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: "error", text: "Passwords do not match." });
      return;
    }
    if (newPassword.length < 8) {
      setPwMsg({
        type: "error",
        text: "New password must be at least 8 characters.",
      });
      return;
    }
    setPwBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to change password");
      }
      setPwOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwUpdated(true);
    } catch (err) {
      setPwMsg({ type: "error", text: (err as Error).message });
    } finally {
      setPwBusy(false);
    }
  }

  async function submitImport(event: React.FormEvent) {
    event.preventDefault();
    if (!importFile) return;
    setImportBusy(true);
    setImportMsg(null);
    try {
      const text = await importFile.text();
      const res = await fetch(
        `/api/auth/import?mode=${importReplace ? "replace" : "merge"}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: text },
      );
      const body = (await res.json().catch(() => null)) as
        | { error?: string; applications?: number; milestones?: number; skipped?: number }
        | null;
      if (!res.ok) throw new Error(body?.error ?? "Import failed");
      setImportMsg({
        type: "ok",
        text: `Imported ${body?.applications ?? 0} applications and ${
          body?.milestones ?? 0
        } milestones${body?.skipped ? `, skipped ${body.skipped} already here` : ""}.`,
      });
      setImportFile(null);
      setImportOpen(false);
      router.refresh();
    } catch (error) {
      setImportMsg({
        type: "error",
        text: error instanceof Error ? error.message : "Import failed",
      });
    } finally {
      setImportBusy(false);
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
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Appearance
          </CardTitle>
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
            <Hourglass className="h-4 w-4" />
            Patience level
          </CardTitle>
          <CardDescription>
            Sets the threshold for the automatic ghosted status.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select
            value={patience}
            onValueChange={(v) => savePatience(v as PatienceLevel)}
            disabled={patienceBusy}
          >
            <SelectTrigger
              id="settings-patience"
              className="w-full sm:w-[240px]"
              aria-label="Patience level"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PATIENCE_LEVELS.map((level) => {
                const Icon = PATIENCE_ICONS[level];
                return (
                  <SelectItem key={level} value={level}>
                    <Icon className="mr-2 h-4 w-4" aria-hidden />
                    {PATIENCE_LABELS[level]}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Message state={patienceMsg} />
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
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-email">Email</Label>
              <Input
                id="settings-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {emailVerified ? (
                <p
                  role="status"
                  className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"
                >
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                  Email verified
                </p>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Not verified yet - check your inbox.
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={resendVerification}
                    disabled={resendBusy}
                  >
                    <Mail />
                    {resendBusy ? "Sending…" : "Resend"}
                  </Button>
                </div>
              )}
            </div>
            <Message state={profileMsg} />
            {dirty && (
              <div className="flex gap-2">
                <Button type="submit" disabled={profileBusy}>
                  <Save />
                  {profileBusy ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelProfile}
                  disabled={profileBusy}
                >
                  <X />
                  Cancel
                </Button>
              </div>
            )}
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
        <CardContent className="space-y-3">
          <Button variant="outline" onClick={() => setPwOpen(true)}>
            <KeyRound />
            Change password
          </Button>
          {pwUpdated && (
            <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
              Password updated.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Your data
          </CardTitle>
          <CardDescription>
            Export a copy of everything you have stored, or delete your
            account permanently (GDPR rights to data portability and erasure).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" asChild>
              {/* A download, not a navigation: the response is a JSON file from
                  an API route, and `<Link>` would try to route to it in the
                  client. The rule exists to catch in-app navigation. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/api/auth/export" download>
                <Download />
                Export my data
              </a>
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setImportMsg(null);
                setImportOpen(true);
              }}
            >
              <Upload />
              Import my data
            </Button>
          </div>
          <Message state={importMsg} />

          {canDeleteAccount ? (
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
                milestones and notes - including archived ones. It cannot be
                undone.
              </p>
            </div>
          ) : (
            <p className="border-t pt-4 text-xs text-muted-foreground">
              Deleting is switched off on this instance: it has one account, and
              removing it would leave nobody able to sign in. Export a copy
              above if you want your data out.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Import modal */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import a Ghosted export</DialogTitle>
            <DialogDescription>
              The JSON file from another instance&rsquo;s &ldquo;Export my data&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitImport} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import-file">Export file</Label>
              <Input
                id="import-file"
                type="file"
                accept="application/json,.json"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-violet-600"
                checked={importReplace}
                onChange={(e) => setImportReplace(e.target.checked)}
              />
              <span>
                Replace everything I have instead of adding to it.
                <span className="block text-xs text-muted-foreground">
                  Your current applications are deleted in the same step, so a
                  file that fails to import changes nothing.
                </span>
              </span>
            </label>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setImportOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!importFile || importBusy}>
                {importBusy ? "Importing…" : "Import"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Password change modal */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>
              Choose a new password (at least 8 characters).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitPassword} className="space-y-4">
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
            <Message state={pwMsg} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPwOpen(false)}
                disabled={pwBusy}
              >
                <X />
                Cancel
              </Button>
              <Button type="submit" disabled={pwBusy}>
                <Save />
                {pwBusy ? "Updating…" : "Update password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
