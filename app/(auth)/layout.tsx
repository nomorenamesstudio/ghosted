import Link from "next/link";
import { AppProviders } from "@/components/AppProviders";
import { runtimeConfig } from "@/lib/config/flags";
import { siteIdentity } from "@/lib/site";

/**
 * Per request: the wordmark links to a landing only on an instance that has one,
 * and the brand tag is the hoster's own. Both are deployment facts, so this
 * group of pages is not prerendered.
 */
export const dynamic = "force-dynamic";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { showLanding } = runtimeConfig();
  const { brandTag } = siteIdentity();

  // The wordmark leads back to the landing on an instance that has one. On a
  // self-hosted instance there is no landing to lead to, and the login screen
  // is the front door — so the mark is a plain wordmark rather than a link to
  // the page the visitor is already on.
  const mark = (
    <div className="text-center">
      <h1 className="text-2xl font-bold tracking-tight">
        Ghosted
        {brandTag && (
          <>
            {" "}
            <sup className="font-mono text-xs font-medium tracking-wide text-violet-700 dark:text-violet-300">
              {brandTag}
            </sup>
          </>
        )}
      </h1>
      <p className="text-sm text-muted-foreground">For the Job Hunters</p>
    </div>
  );

  return (
    // The forms here use the session (verify-email) and the query cache
    // (login/register clear it on success), so this group mounts the auth
    // layer. The landing and legal pages deliberately do not.
    <AppProviders>
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <main className="w-full max-w-sm space-y-6">
          {showLanding ? (
            <Link
              href="/"
              className="flex flex-col items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {mark}
            </Link>
          ) : (
            <div className="flex flex-col items-center gap-2">{mark}</div>
          )}
          {children}
        </main>
      </div>
    </AppProviders>
  );
}
