import Link from "next/link";
import {
  BarChart3,
  ClipboardList,
  Ghost,
  MoonStar,
  ShieldCheck,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ApplicationCardView } from "./ApplicationCard";
import { StatusIcon } from "./status-icons";
import type { ApplicationListItem } from "@/lib/api";

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

/** Sample applications rendered with the real dashboard card component. */
const DAY = 86_400_000;
const now = Date.now();
const MOCK_APPS: ApplicationListItem[] = [
  {
    id: "preview-stripe",
    userId: "preview",
    company: "Stripe",
    role: "Senior Engineer",
    url: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    notes: null,
    status: "interviewing",
    displayStatus: "interviewing",
    isFavorite: true,
    archivedFromStatus: null,
    totalSteps: 5,
    createdAt: new Date(now - 21 * DAY),
    updatedAt: new Date(now - 2 * DAY),
    progress: 60,
    currentRound: "Technical Interview",
    milestoneCount: 5,
  },
  {
    id: "preview-vercel",
    userId: "preview",
    company: "Vercel",
    role: "Frontend Engineer",
    url: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    notes: null,
    status: "applied",
    displayStatus: "applied",
    isFavorite: false,
    archivedFromStatus: null,
    totalSteps: 5,
    createdAt: new Date(now - 6 * DAY),
    updatedAt: new Date(now - 3 * DAY),
    progress: 40,
    currentRound: "HR Screen",
    milestoneCount: 5,
  },
  {
    id: "preview-linear",
    userId: "preview",
    company: "Linear",
    role: "Product Engineer",
    url: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    notes: null,
    status: "applied",
    displayStatus: "applied",
    isFavorite: false,
    archivedFromStatus: null,
    totalSteps: 5,
    createdAt: new Date(now - 4 * DAY),
    updatedAt: new Date(now - 1 * DAY),
    progress: 20,
    currentRound: "Application",
    milestoneCount: 5,
  },
  {
    id: "preview-framer",
    userId: "preview",
    company: "Framer",
    role: "Product Designer",
    url: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    notes: null,
    status: "applied",
    displayStatus: "ghosted",
    isFavorite: false,
    archivedFromStatus: null,
    totalSteps: 5,
    createdAt: new Date(now - 40 * DAY),
    updatedAt: new Date(now - 15 * DAY),
    progress: 20,
    currentRound: "Application",
    milestoneCount: 5,
  },
];

/** Tab-style section header in the mock (segmented control look). */
function MockTab({
  status,
  title,
  count,
  active = false,
}: {
  status: "applied" | "interviewing" | "ghosted";
  title: string;
  count: number;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground",
      )}
    >
      <StatusIcon status={status} className="h-3.5 w-3.5" />
      {title}
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
          active ? "bg-muted" : "bg-muted/60",
        )}
      >
        {count}
      </span>
    </span>
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
        {/* Hero — inverted purple band */}
        <section className="bg-gradient-to-b from-violet-600 to-violet-700 px-4 pb-32 pt-16 text-center sm:pt-24">
          <Ghost
            className="mx-auto h-20 w-20 text-white drop-shadow-[0_10px_20px_rgba(0,0,0,0.25)]"
            aria-hidden
          />
          <h1 className="mx-auto mt-6 max-w-2xl text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Never let a job application go quiet on you.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-violet-100">
            Ghosted keeps every application, interview and offer on one clear
            timeline — and gently reminds you of the ones that went silent.
            Your job hunt, without the ghosting.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button
              size="lg"
              className="bg-white text-violet-700 shadow hover:bg-violet-100"
              asChild
            >
              <Link href="/register">Start tracking free</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
              asChild
            >
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </section>

        {/* Product mock — the real dashboard cards, overlapping the hero edge */}
        <div className="mx-auto -mt-20 max-w-xl px-4" aria-hidden>
          <div className="rounded-xl border bg-card p-4 text-left shadow-2xl">
            <div className="mb-3 flex gap-1 rounded-lg border bg-muted/50 p-1">
              <MockTab status="applied" title="Applied" count={2} active />
              <MockTab status="interviewing" title="Interviewing" count={1} />
              <MockTab status="ghosted" title="Ghosted" count={1} />
            </div>
            <ul className="space-y-2">
              {MOCK_APPS.map((app) => (
                <li key={app.id}>
                  <ApplicationCardView app={app} />
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Features */}
        <section
          aria-label="Features"
          className="mx-auto max-w-5xl px-4 pb-16 pt-12"
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
