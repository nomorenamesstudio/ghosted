"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStats } from "@/lib/api";
import type { DisplayStatus } from "@/lib/utils/status";
import { DashboardStats } from "./DashboardStats";
import { DonateBanner } from "./DonateBanner";
import { VerificationBanner } from "./VerificationBanner";
import { ApplicationList, type ViewMode } from "./ApplicationList";
import { ScrollTopButton } from "./ScrollTopButton";
import { useAccountIsEmpty } from "./use-account-is-empty";

const VIEW_KEY = "ghosted-view";

/**
 * Which view is active lives here, not in ApplicationList, because the board
 * needs more than the list does: the page shell widens to the full window and
 * the stat cards step aside to give the columns the room.
 *
 * The board is the default; a stored preference is applied *after* mount, since
 * reading localStorage during the first render would paint a different toggle on
 * the client than the server sent — a hydration mismatch.
 */
export function Dashboard({
  emailVerified,
  applicationCount,
  unverifiedAppLimit,
  patienceDays,
}: {
  emailVerified: boolean;
  applicationCount: number;
  unverifiedAppLimit: number;
  /** Ghosted threshold from the user's patience level (Settings). */
  patienceDays: number;
}) {
  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: () => getStats(),
  });

  // While the account is empty the verification banner stays out of the way:
  // its limit only starts to matter once there is something to add, and the
  // empty state is meant to be the single focus on the screen. It returns with
  // the first application.
  const accountIsEmpty = useAccountIsEmpty(applicationCount);

  // Status filter, shared between the clickable stat cards and the dropdown.
  const [status, setStatus] = useState<"" | DisplayStatus>("");
  // The board is the default view.
  const [view, setView] = useState<ViewMode>("board");
  // Whether the stored preference has been read yet. The shell's width is keyed
  // on `data-view`, the inline script in the root layout already set that from
  // storage before first paint, and this flag is what keeps this component from
  // touching it until it knows the same value — otherwise a list user's shell
  // would flash to board width and back on the way to "list".
  const [viewKnown, setViewKnown] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_KEY);
      if (stored === "board" || stored === "list") setView(stored);
    } catch {
      /* ignore storage errors */
    }
    setViewKnown(true);
  }, []);

  // The shell (header + main) is widened by a rule keyed on this attribute, so
  // the layout stays a server component. The pre-paint script set it already;
  // from here it is only kept in sync with the toggle.
  useEffect(() => {
    if (!viewKnown) return;
    const root = document.documentElement;
    if (view === "board") root.dataset.view = "board";
    else delete root.dataset.view;
    return () => {
      delete root.dataset.view;
    };
  }, [view, viewKnown]);

  function changeView(next: ViewMode) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignore storage errors */
    }
  }

  return (
    <>
      {/* sr-only h1 kept outside the spaced container so it doesn't push the
          banner down (space-y applies margin to every sibling after the first). */}
      <h1 className="sr-only">Applications</h1>
      <div className="space-y-6 pt-4">
        {/* Both banners live in the content flow, above the stats - same
            Card design, different intent (amber = verification, violet =
            donation). The donation banner already hides itself until there are
            offers to celebrate; the verification one steps aside while the
            account is empty. */}
        {!accountIsEmpty && (
          <VerificationBanner
            emailVerified={emailVerified}
            limit={unverifiedAppLimit}
          />
        )}
        <DonateBanner offers={stats?.data?.offers ?? 0} />
        {/* Stats are a list-view summary (they filter the sections); on the
            board the columns already show every count, so they stay out of
            the way. */}
        {view === "list" && (
          <DashboardStats
            stats={stats?.data}
            activeStatus={status}
            onSelect={setStatus}
          />
        )}
        <ApplicationList
          status={status}
          onStatusChange={setStatus}
          view={view}
          onViewChange={changeView}
          emailVerified={emailVerified}
          applicationCount={applicationCount}
          unverifiedAppLimit={unverifiedAppLimit}
          patienceDays={patienceDays}
        />
      </div>
      <ScrollTopButton />
    </>
  );
}
