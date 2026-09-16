import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { DEFAULT_PATIENCE_LEVEL } from "@/lib/utils/status";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [user] = await db
    .select({
      emailVerified: users.emailVerified,
      patienceLevel: users.patienceLevel,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return (
    <SettingsForm
      name={session.user.name ?? ""}
      email={session.user.email ?? ""}
      emailVerified={user?.emailVerified ?? false}
      patienceLevel={user?.patienceLevel ?? DEFAULT_PATIENCE_LEVEL}
    />
  );
}
