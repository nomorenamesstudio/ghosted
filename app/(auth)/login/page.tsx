import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { runtimeConfig } from "@/lib/config/flags";
import { configuredOAuthProviders } from "@/lib/config/oauth-providers";
import { LoginForm } from "./login-form";

// The OAuth button list depends on runtime env (AUTH_GOOGLE_ID etc.). Keep this
// page dynamic so the buttons appear/disappear with the live env, not with
// whatever was inlined at build time.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // "Sign in" is the way back into the app for someone who is already signed in:
  // the landing no longer bounces them, on purpose, so this is where that state
  // is answered. The page is dynamic anyway (the OAuth buttons follow the live
  // environment), so the session read costs nothing here.
  const user = await getCurrentUser();
  if (user) redirect("/app");

  const { allowRegistration } = runtimeConfig();
  // Credentials decide the buttons, not the registration flag: an instance that
  // ran with sign-ups open and closed them later keeps its provider sign-in for
  // the accounts that already exist. A sign-in with no account behind it is
  // refused in the `signIn` callback, with a message.
  const providers = configuredOAuthProviders().map(({ provider }) => provider);
  return (
    <Suspense>
      <LoginForm providers={providers} allowRegistration={allowRegistration} />
    </Suspense>
  );
}
