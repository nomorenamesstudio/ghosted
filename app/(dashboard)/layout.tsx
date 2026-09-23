import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UserMenu } from "@/components/UserMenu";
import { AppBrand } from "@/components/AppBrand";
import { AppProviders } from "@/components/AppProviders";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    // The session and query-cache layer lives here rather than in the root
    // layout: the landing and legal pages are static and need neither, and used
    // to load both (plus a session request) for nothing.
    <AppProviders>
      <div className="min-h-screen">
        {/* Same surface as the board columns (bg-card / dark:bg-muted/20): the
            header and the columns read as one white frame around the grey page. */}
        <header className="sticky top-0 z-40 border-b bg-card backdrop-blur dark:bg-muted/20">
          <div className="app-shell mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
            <AppBrand />
            {/* On a wide screen the board portals its search, sort, view switch and
                "Add application" button in here, right-aligned beside the account
                menu, so the board gets the full width under the header. */}
            <div
              id="dashboard-header-slot"
              data-testid="header-slot"
              className="ml-auto hidden items-center gap-2 xl:flex"
            />
            <UserMenu
              name={session.user.name ?? ""}
              email={session.user.email ?? ""}
              image={session.user.image ?? undefined}
            />
          </div>
        </header>
        <main className="app-shell mx-auto max-w-5xl px-4 pb-28">{children}</main>
      </div>
    </AppProviders>
  );
}
