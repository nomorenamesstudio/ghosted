import Link from "next/link";
import { Ghost } from "lucide-react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UserMenu } from "@/components/UserMenu";

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
          <Link href="/" className="flex items-center gap-2">
            <Ghost className="h-5 w-5 text-violet-500" aria-hidden />
            <span className="flex flex-col leading-tight">
              <span className="font-semibold tracking-tight">Ghosted</span>
              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                For the Job Hunters
              </span>
            </span>
          </Link>
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
