"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useVerification } from "./use-verification";

/**
 * Shown when an unverified user at the application cap tries to add another
 * application: explain the cap, resend the verification email, or defer -
 * so the user never fills a form just to be rejected. Follows the app's
 * standard dialog structure (see ConfirmDialog / AddApplicationModal).
 */
export function VerificationModal({
  open,
  onOpenChange,
  limit = 3,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Application cap for unverified accounts (server's UNVERIFIED_APP_LIMIT). */
  limit?: number;
}) {
  const { busy, message, resend, later } = useVerification();

  function handleLater() {
    later();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader className="space-y-3">
          <DialogTitle>Verify your email</DialogTitle>
          <DialogDescription className="text-base text-muted-foreground">
            Unverified accounts are limited to {limit} applications. We emailed
            you a link, simply click it and get verified immediately.
          </DialogDescription>
          {message && (
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
              {message}
            </p>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleLater}
            disabled={busy}
          >
            Later
          </Button>
          <Button onClick={resend} disabled={busy}>
            {busy ? "Sending…" : "Resend email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
