"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStats } from "@/lib/api";
import type { DisplayStatus } from "@/lib/utils/status";
import { DonateBanner } from "./DonateBanner";
import { PasswordNoticeBanner } from "./PasswordNoticeBanner";
import { VerificationBanner } from "./VerificationBanner";
import { ApplicationList } from "./ApplicationList";
import { useHydrateView, useViewMode } from "./view-mode";
import { ScrollTopButton } from "./ScrollTopButton";
import { useAccountIsEmpty } from "./use-account-is-empty";

/**
 * The board needs more than the list does: the page shell widens to the full
 * window to give the columns the room, and that rule is keyed on `<html
 * data-view>`, which `components/view-mode.ts` owns along with the stored choice.
 *
 * The board is the default; a stored preference is applied *after* mount, since
 * reading localStorage during the first render would paint a different toggle on
 * the client than the server sent — a hydration mismatch.
 */
export function Dashboard({
  emailVerified,
  passwordDropped,
  applicationCount,
  unverifiedAppLimit,
  patienceDays,
}: {
  emailVerified: boolean;
  /** True while the account still owes the "we cleared your password" notice. */
  passwordDropped: boolean;
  applicationCount: number;
  unverifiedAppLimit: number;
  /** Ghosted threshold from the user's patience level (Settings). */
  patienceDays: number;
}) {
  const statsQuery = useQuery({
    queryKey: ["stats"],
    queryFn: () => getStats(),
  });
  const stats = statsQuery.data;

  // While the account is empty the verification banner stays out of the way:
  // its limit only starts to matter once there is something to add, and the
  // empty state is meant to be the single focus on the screen. It returns with
  // the first application.
  const accountIsEmpty = useAccountIsEmpty(applicationCount);

  // What the donate banner counts. Until it is in, the banners and the list
  // below stay out of the way (see the ready gate in ApplicationList): the
  // account's shape is simply not known yet.
  const statsReady = !statsQuery.isPending;

  // Status filter, owned here and driven by the list's dropdown.
  const [status, setStatus] = useState<"" | DisplayStatus>("");
  // Which view is showing comes from the shared store (components/view-mode.ts):
  // the user menu switches it, this page renders it, and the store owns the stored
  // preference and `data-view` on <html>.
  const { view } = useViewMode();
  useHydrateView();

  // `data-board-content` is this page's own content, which is the only content that
  // widens with the board — so unlike `data-view` it does not outlive the dashboard:
  // a detail page reached from the board keeps the wide frame, without carrying the
  // board's content width.
  useEffect(() => {
    const root = document.documentElement;
    if (view === "board") {
      root.dataset.boardContent = "";
    } else {
      delete root.dataset.boardContent;
    }
    return () => {
      delete root.dataset.boardContent;
    };
  }, [view]);

  return (
    <>
      {/* sr-only h1 kept outside the spaced container so it doesn't push the
          banner down (space-y applies margin to every sibling after the first). */}
      <h1 className="sr-only">Applications</h1>
      <div className="space-y-6 pt-4">
        {/* About the account, not about applications, so it does not wait for
            the totals and shows on an empty dashboard too. Dismissing it is a
            write to the server, so it does not come back. */}
        <PasswordNoticeBanner show={passwordDropped} />
        {/* Nothing above or below the header renders until the totals are in.
            The banner's own reason to exist depends on them (an account with no
            applications never shows it) - and that is the same "we do not know
            yet" state the list itself waits in, so they appear together rather
            than one at a time. The donation banner is left where it is: it hides
            itself until there are offers to celebrate, so it is already silent
            on load. */}
        {statsReady && !accountIsEmpty && (
          <VerificationBanner
            emailVerified={emailVerified}
            limit={unverifiedAppLimit}
          />
        )}
        {statsReady && <DonateBanner offers={stats?.data?.offers ?? 0} />}
        {/* No stat cards: every count they carried is already on screen in the
            view that is showing — the section headers in the list, the column
            headers on the board — and a row of totals above them was one summary
            of a summary, taking the first screenful of the page. The status
            filter they used to drive stays in the list's toolbar. */}
        <ApplicationList
          status={status}
          onStatusChange={setStatus}
          view={view}
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
