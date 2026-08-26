import Link from "next/link";
import {
  BarChart3,
  ClipboardList,
  Ghost,
  MoonStar,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const FEATURES = [
  {
    icon: ClipboardList,
    title: "One timeline per application",
    body: "Start with the 5 standard steps — Application, HR Screen, Technical Interview, Test, Offer — and add your own as the process grows.",
  },
  {
    icon: Ghost,
    title: "Ghosted detection",
    body: "Applications that go quiet for two weeks quietly float into their own section, so nothing slips your mind.",
  },
  {
    icon: BarChart3,
    title: "Stats at a glance",
    body: "Offers, interviews, rejections and stale applications — a lightweight dashboard that tells you where your hunt stands.",
  },
  {
    icon: Star,
    title: "Favourites first",
    body: "Pin the applications that matter most and they always stay on top of their section.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    body: "Your data stays yours: export everything as JSON or delete your account permanently, any time (GDPR friendly).",
  },
  {
    icon: MoonStar,
    title: "Calm & accessible",
    body: "Dark mode by default, keyboard friendly, and continuously checked for accessibility.",
  },
];

function MockRow({
  company,
  round,
  progress,
  tint,
}: {
  company: string;
  round: string;
  progress: number;
  tint: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{company}</p>
        <p className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs ${tint}`}>
          {round}
        </p>
      </div>
      <div className="flex w-24 shrink-0 flex-col items-end gap-1">
        <span className="text-xs font-semibold tabular-nums">{progress}%</span>
        <Progress value={progress} className="w-full" aria-hidden />
      </div>
    </div>
  );
}

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Ghost className="h-5 w-5 text-violet-500" aria-hidden />
            <span className="font-semibold tracking-tight">
              Ghosted
              <sup className="ml-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">
                beta
              </sup>
            </span>
          </Link>
          <nav aria-label="Account" className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-4 pb-12 pt-16 text-center sm:pt-24">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/60 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-300">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Now in beta — free to use
          </span>
          <h1 className="mx-auto mt-6 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            Never let an application go quiet.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Ghosted keeps every application, interview and offer on one clear
            timeline — and gently reminds you of the ones that went silent.
            Your job hunt, without the ghosting.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button size="lg" asChild>
              <Link href="/register">Start tracking free</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>

          {/* Product mock */}
          <div
            className="mx-auto mt-12 max-w-md rounded-xl border bg-card p-4 text-left shadow-lg"
            aria-hidden
          >
            <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Applied · 2</span>
              <span className="text-violet-600 dark:text-violet-300">
                Ghosted · 1
              </span>
            </div>
            <div className="space-y-2">
              <MockRow
                company="Stripe"
                round="Technical Interview"
                progress={60}
                tint="bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
              />
              <MockRow
                company="Vercel"
                round="HR Screen"
                progress={40}
                tint="bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
              />
              <MockRow
                company="Framer"
                round="👻 ghosted"
                progress={20}
                tint="bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
              />
            </div>
          </div>
        </section>

        {/* Features */}
        <section
          aria-label="Features"
          className="mx-auto max-w-5xl px-4 pb-16"
        >
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Everything a job hunt needs, nothing it doesn&apos;t
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title}>
                <CardContent className="p-5">
                  <f.icon className="h-5 w-5 text-violet-500" aria-hidden />
                  <h3 className="mt-3 font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA band */}
        <section className="border-t bg-muted/40">
          <div className="mx-auto max-w-3xl px-4 py-14 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Ready to stop getting ghosted?
            </h2>
            <p className="mt-2 text-muted-foreground">
              Create your free account and start your first timeline in under a
              minute.
            </p>
            <Button size="lg" className="mt-6" asChild>
              <Link href="/register">
                <Ghost className="h-5 w-5" aria-hidden />
                Create your free account
              </Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
