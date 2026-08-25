import Link from "next/link";
import { ArrowLeft, Ghost } from "lucide-react";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Ghost className="h-5 w-5 text-violet-500" aria-hidden />
            <span className="font-semibold tracking-tight">Ghosted</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to app
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
