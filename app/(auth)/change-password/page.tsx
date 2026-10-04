import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";

/**
 * Where a boot-seeded owner lands on their first sign-in.
 *
 * The generated password is in the container log, so it is a credential for one
 * purpose: replacing itself. `requireUser` sends every other page here while the
 * flag is set, and the API refuses writes, so this page is the only way forward —
 * and the way forward is short.
 */
export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Nothing to force: someone with a password of their own goes back to the app.
  if (!user.mustChangePassword) redirect("/app");

  return <ChangePasswordForm />;
}
