import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { LoginForm } from "./login-form";

// The OAuth button visibility depends on runtime env (AUTH_GOOGLE_ID etc.).
// Keep this page dynamic so the button appears/disappears with the live env,
// not with whatever was inlined at build time.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // "Sign in" is the way back into the app for someone who is already signed in:
  // the landing no longer bounces them, on purpose, so this is where that state
  // is answered. The page is dynamic anyway (the OAuth buttons follow the live
  // environment), so the session read costs nothing here.
  const user = await getCurrentUser();
  if (user) redirect("/app");

  const providers = {
    google: Boolean(
      process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
    ),
    linkedin: Boolean(
      process.env.AUTH_LINKEDIN_ID && process.env.AUTH_LINKEDIN_SECRET,
    ),
  };
  return (
    <Suspense>
      <LoginForm providers={providers} />
    </Suspense>
  );
}
