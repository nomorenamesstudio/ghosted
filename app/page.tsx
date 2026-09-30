import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { runtimeConfig } from "@/lib/config/flags";
import { Landing } from "@/components/Landing";

export default async function HomePage() {
  // Signed-in users go straight to the app — on every shape of the deployment,
  // including one whose `/` is a redirect to the login screen.
  const user = await getCurrentUser();
  if (user) redirect("/app");

  // The landing is the hosted instance's front door. A self-hosted instance
  // turns it off and starts at the login screen instead.
  if (!runtimeConfig().showLanding) redirect("/login");

  return <Landing />;
}
