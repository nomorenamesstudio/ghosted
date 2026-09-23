"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import type { ApplicationListItem } from "@/lib/api";
import { CompanyAvatar } from "./CompanyAvatar";
import { Progress } from "@/components/ui/progress";
import { ApplicationCardShell } from "./ApplicationCardShell";
import { STATUS_PROGRESS } from "@/lib/utils/card-styles";

/**
 * The card visuals, without the list/link wrapper — shared by the real
 * dashboard card and the landing-page product mock.
 *
 * The markup itself lives in `ApplicationCardShell`, which is a server
 * component: this wrapper adds only what genuinely needs the client, namely the
 * live relative timestamp, the Radix avatar and the Radix progress bar. The
 * landing page renders the same shell with static values, so it no longer ships
 * any of those three.
 *
 * `compact` drops the desktop one-line layout for the narrow kanban columns:
 * the viewport breakpoints in the default layout are no use inside a 300px
 * column, where the card must always stack.
 *
 * `reserveActions` leaves room at the end of the progress row for a control the
 * board floats there (its "Move to" menu), so the bar stops short of it instead
 * of running underneath.
 */
export function ApplicationCardView({
  app,
  className,
  compact = false,
  reserveActions = false,
  logoUrl,
}: {
  app: ApplicationListItem;
  className?: string;
  compact?: boolean;
  reserveActions?: boolean;
  /** Real logo for mock data, which has no application id to look one up by. */
  logoUrl?: string | null;
}) {
  const status = app.displayStatus;
  return (
    <ApplicationCardShell
      status={status}
      company={app.company}
      role={app.role}
      isFavorite={app.isFavorite}
      currentRound={app.currentRound}
      updatedLabel={`Updated ${formatDistanceToNow(new Date(app.updatedAt), {
        addSuffix: true,
      })}`}
      progress={app.progress}
      milestoneCount={app.milestoneCount}
      className={className}
      compact={compact}
      reserveActions={reserveActions}
      avatar={
        <CompanyAvatar
          applicationId={app.id}
          company={app.company}
          version={app.updatedAt}
          cacheKey={`${app.url ?? ""}|${app.companyWebsite ?? ""}`}
          srcOverride={logoUrl}
          size="lg"
        />
      }
      progressBar={
        <Progress
          value={app.progress}
          aria-label="Application progress"
          segments={app.milestoneCount}
          className={`flex-1 ${STATUS_PROGRESS[status].track}`}
          indicatorClassName={STATUS_PROGRESS[status].fill}
        />
      }
    />
  );
}

export function ApplicationCard({ app }: { app: ApplicationListItem }) {
  return (
    <li>
      <Link href={`/applications/${app.id}`} className="block">
        <ApplicationCardView app={app} />
      </Link>
    </li>
  );
}
