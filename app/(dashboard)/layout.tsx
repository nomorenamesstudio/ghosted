import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UserMenu } from "@/components/UserMenu";
import { AppBrand } from "@/components/AppBrand";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <AppBrand />
          <UserMenu
            name={session.user.name ?? ""}
            email={session.user.email ?? ""}
          />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-28">{children}</main>
    </div>
  );
}
