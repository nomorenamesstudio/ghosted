"use client";

import { useState } from "react";
import { Coffee } from "lucide-react";
import {
  DONATE_URL,
  dismissBanner,
  readDonateState,
  shouldShowBanner,
  writeDonateState,
} from "@/lib/utils/donate-banner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

export function DonateBanner({ offers }: { offers: number }) {
  const [state, setState] = useState(readDonateState);

  if (!shouldShowBanner(state, offers > 0)) return null;

  function onDismiss() {
    const next = dismissBanner(state);
    setState(next);
    writeDonateState(next);
  }

  return (
    <Card className="border-amber-300/60 bg-gradient-to-r from-amber-50 to-violet-50 dark:border-amber-800/60 dark:from-amber-950/40 dark:to-violet-950/40">
      <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>
            ☕
          </span>
          <div className="space-y-0.5">
            <p className="text-sm font-medium">
              Congratulations on the offer — happy job hunting! 🎉
            </p>
            <p className="text-sm text-muted-foreground">
              If Ghosted has been useful in your job-seeking journey, please
              consider buying us a coffee — every cup keeps the ghost alive
              and the tracker free for everyone.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild size="sm">
            <a href={DONATE_URL} target="_blank" rel="noopener noreferrer">
              <Coffee />
              Buy us a coffee
            </a>
          </Button>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Not now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
