import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <SettingsForm name={session.user.name ?? ""} email={session.user.email ?? ""} />
  );
}
