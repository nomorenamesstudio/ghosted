import { Ghost } from "lucide-react";

/**
 * What the dashboard shows until we know *which* dashboard to draw.
 *
 * Three things decide the shape of the page — whether the stored preference says
 * board or list, whether the account has any applications at all (and so shows the
 * empty state instead), and what the first page of each section contains — and all
 * three live in the browser. Rendering the real chrome before they are known meant
 * showing a verification banner, a search box and six empty columns, and then
 * rearranging them.
 *
 * So the page shows this and nothing else. No card placeholders: a skeleton card
 * promises a list of applications, and until those totals are in we do not know
 * whether there will be a list at all — an account with nothing in it goes
 * straight from here to the empty state. The header above stays real, because the
 * brand and the account menu do not depend on any of it.
 */
export function DashboardLoading() {
  return (
    <div
      className="flex flex-col items-center gap-4 py-24"
      data-testid="dashboard-loading"
      aria-busy="true"
    >
      <Ghost
        className="h-16 w-16 animate-pulse text-violet-400"
        aria-hidden
        strokeWidth={1.25}
      />
      <p className="text-sm text-muted-foreground" role="status">
        Reading paranormal data…
      </p>
    </div>
  );
}
