import { Ghost } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <main className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
            <Ghost className="h-7 w-7" aria-hidden />
          </span>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Ghosted</h1>
            <p className="text-sm text-muted-foreground">For the Job Hunters</p>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
