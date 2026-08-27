import Link from "next/link";
import { BrandGhost } from "@/components/BrandGhost";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <main className="w-full max-w-sm space-y-6">
        <Link
          href="/"
          className="flex flex-col items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <BrandGhost className="h-12 w-12" />
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">
              Ghosted
              <sup className="ml-0.5 text-xs font-medium text-violet-700 dark:text-violet-300">
                β
              </sup>
            </h1>
            <p className="text-sm text-muted-foreground">For the Job Hunters</p>
          </div>
        </Link>
        {children}
      </main>
    </div>
  );
}
