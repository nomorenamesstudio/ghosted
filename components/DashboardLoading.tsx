import { GhostPulse, SkeletonGhostCard } from "./loading";

/**
 * What the dashboard shows until we know *which* dashboard to draw.
 *
 * Three things decide the shape of the page — whether the stored preference says
 * board or list, whether the account has any applications at all (and so shows the
 * empty state instead), and what the first page of each section contains — and all
 * three live in the browser. Rendering the real chrome before they are known
 * meant showing a verification banner, a search box and six empty columns, then
 * rearranging them: the banner appearing for an account with no applications, the
 * toolbar moving into the header, columns filling in.
 *
 * So until then the page shows this and nothing else: the app's own loading motif
 * (the pulsing ghost) over card-shaped placeholders. It is deliberately neutral
 * between board and list — there is no honest way to draw either one yet — and the
 * header above it stays real, because the brand and the account menu do not depend
 * on any of it.
 */
export function DashboardLoading() {
  return (
    <div className="space-y-4" data-testid="dashboard-loading" aria-busy="true">
      <GhostPulse className="pt-8" />
      <div className="space-y-2">
        <SkeletonGhostCard />
        <SkeletonGhostCard />
        <SkeletonGhostCard />
      </div>
      <p className="sr-only">Loading your applications</p>
    </div>
  );
}
