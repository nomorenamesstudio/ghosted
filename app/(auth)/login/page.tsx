import { Suspense } from "react";
import { LoginForm } from "./login-form";

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
