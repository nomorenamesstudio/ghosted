import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import {
  countApplications,
  UNVERIFIED_APP_LIMIT,
} from "@/lib/services/applications";
import { ghostedAfterDays } from "@/lib/utils/status";
import { Dashboard } from "@/components/Dashboard";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Server-side authority for the FAB gate: emailVerified straight from the
  // DB (never stale), plus the current application count so the client can
  // switch to the verification modal exactly when the cap is reached.
  //
  // Both reads only need the session, so they go out together: they used to be
  // two round-trips, one after the other, on every dashboard render.
  const [[dbUser], applicationCount] = await Promise.all([
    db
      .select({
        emailVerified: users.emailVerified,
        patienceLevel: users.patienceLevel,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1),
    countApplications(session.user.id),
  ]);
  const emailVerified = dbUser?.emailVerified ?? false;
  // The board's ghosted column names the actual threshold.
  const patienceDays = ghostedAfterDays(dbUser?.patienceLevel);

  return (
    <Dashboard
      emailVerified={emailVerified}
      applicationCount={applicationCount}
      unverifiedAppLimit={UNVERIFIED_APP_LIMIT}
      patienceDays={patienceDays}
    />
  );
}
