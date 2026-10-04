import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/current-user";
import { runtimeConfig } from "@/lib/config/flags";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { DEFAULT_PATIENCE_LEVEL } from "@/lib/utils/status";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const user = await requireUser();
  const { allowRegistration } = runtimeConfig();

  const [dbUser] = await db
    .select({
      emailVerified: users.emailVerified,
      patienceLevel: users.patienceLevel,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return (
    <SettingsForm
      name={user.name ?? ""}
      email={user.email ?? ""}
      emailVerified={dbUser?.emailVerified ?? false}
      patienceLevel={dbUser?.patienceLevel ?? DEFAULT_PATIENCE_LEVEL}
      canDeleteAccount={allowRegistration}
    />
  );
}
