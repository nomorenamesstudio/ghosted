import { Suspense } from "react";
import { LoginForm } from "./login-form";

// The OAuth button visibility depends on runtime env (AUTH_GOOGLE_ID etc.).
// Keep this page dynamic so the button appears/disappears with the live env,
// not with whatever was inlined at build time.
export const dynamic = "force-dynamic";

export default function LoginPage() {
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
