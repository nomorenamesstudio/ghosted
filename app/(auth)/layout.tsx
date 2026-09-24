import Link from "next/link";
import { AppProviders } from "@/components/AppProviders";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The forms here use the session (verify-email) and the query cache
    // (login/register clear it on success), so this group mounts the auth
    // layer. The landing and legal pages deliberately do not.
    <AppProviders>
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <main className="w-full max-w-sm space-y-6">
          <Link
            href="/"
            className="flex flex-col items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {/* No ghost glyph: the illustration belongs to the hero, the icon and
                the social card now, and the sign-in page was the third place the
                same character showed up before a user had done anything. The
                wordmark and its mono "beta" match the header's mark. */}
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight">
                Ghosted{" "}
                <sup className="font-mono text-xs font-medium tracking-wide text-violet-700 dark:text-violet-300">
                  beta
                </sup>
              </h1>
              <p className="text-sm text-muted-foreground">For the Job Hunters</p>
            </div>
          </Link>
          {children}
        </main>
      </div>
    </AppProviders>
  );
}
