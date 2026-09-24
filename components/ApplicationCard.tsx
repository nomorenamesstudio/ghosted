"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import type { ApplicationListItem } from "@/lib/api";
import type { ApplicationStatus } from "@/lib/db/schema";
import type { DisplayStatus } from "@/lib/utils/status";
import { CompanyAvatar } from "./CompanyAvatar";
import { MoveToMenu } from "./MoveToMenu";
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
          logoMissing={app.logoMissing}
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

/**
 * A card in the list view: the shared visuals, the link to the application, and
 * the same "Move to" kebab the board's cards carry — the list has no drag and
 * drop, so this is the whole of its status changing.
 *
 * The menu is a *sibling* of the `<Link>`, not a child: a button inside an
 * anchor still navigates when clicked, and the kebab has to open its menu
 * instead. `reserveActions` keeps the progress bar clear of it.
 */
export function ApplicationCard({
  app,
  onMove,
}: {
  app: ApplicationListItem;
  /** `from` is the card's own displayed status; the view decides what to do. */
  onMove: (
    id: string,
    from: DisplayStatus,
    to: ApplicationStatus,
    company: string,
  ) => void;
}) {
  return (
    <li className="relative">
      <Link href={`/applications/${app.id}`} className="block">
        <ApplicationCardView app={app} reserveActions />
      </Link>
      <MoveToMenu
        app={app}
        onMove={(id, to, company) => onMove(id, app.displayStatus, to, company)}
        // Centred on the progress bar it makes room for. Measured: the bar's
        // centre sits 25px above the card's bottom edge (p-4, the 1px card
        // border, and the bar's own half-row), so a 28px trigger needs
        // 25 - 14. `reserveActions` keeps the bar out of its way horizontally.
        className="absolute bottom-[11px] right-4"
      />
    </li>
  );
}
