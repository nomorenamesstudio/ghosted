import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/current-user";
import { runtimeConfig } from "@/lib/config/flags";
import { configuredOAuthProviders } from "@/lib/config/oauth-providers";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { listLinkedAccounts } from "@/lib/services/oauth-accounts";
import { DEFAULT_PATIENCE_LEVEL } from "@/lib/utils/status";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const user = await requireUser();
  const { allowRegistration } = runtimeConfig();

  const [dbUser] = await db
    .select({
      emailVerified: users.emailVerified,
      patienceLevel: users.patienceLevel,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  // Which sign-in providers this instance offers, and which of them are
  // attached to this account. Read together so the panel can show a linked
  // provider whose credentials the operator has since removed — the link still
  // exists, and hiding it would make the account look smaller than it is.
  const oauthProviders = configuredOAuthProviders().map(({ provider }) => provider);
  const linkedProviders = (await listLinkedAccounts(user.id)).map(
    ({ provider }) => provider,
  );

  return (
    <SettingsForm
      name={user.name ?? ""}
      email={user.email ?? ""}
      emailVerified={dbUser?.emailVerified ?? false}
      patienceLevel={dbUser?.patienceLevel ?? DEFAULT_PATIENCE_LEVEL}
      canDeleteAccount={allowRegistration}
      oauthProviders={oauthProviders}
      linkedProviders={linkedProviders}
      hasPassword={Boolean(dbUser?.passwordHash)}
    />
  );
}
