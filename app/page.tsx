import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Landing } from "@/components/Landing";

export default async function HomePage() {
  // Signed-in users go straight to the app.
  const session = await auth();
  if (session?.user) redirect("/app");

  return <Landing />;
}
