import Link from "next/link";
import {
  BarChart3,
  Bell,
  BellOff,
  BookOpen,
  BotOff,
  Briefcase,
  Calendar,
  ClipboardList,
  Clock,
  Coffee,
  FileText,
  Ghost,
  Globe,
  Mail,
  MailX,
  MessageSquare,
  Paperclip,
  Phone,
  Send,
  ShieldCheck,
  Star,
  Tag,
  Users,
  Video,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ApplicationCardView } from "./ApplicationCard";
import { HeroGhost } from "./HeroGhost";
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
    icon: Wallet,
    title: "Free forever",
    body: "Job hunting is a pain already — the log shouldn't cost you too. Free for casual use, always.",
  },
];

/** Things Ghosted deliberately does NOT do — a logbook, not automation. */
const NOT_DOING = [
  {
    icon: BellOff,
    title: "No notifications",
    body: "No pings, no push alerts, no inbox noise — you open the log when you feel like it.",
  },
  {
    icon: MailX,
    title: "No email scanning",
    body: "Your mailbox stays yours. Ghosted only knows what you type into it.",
  },
  {
    icon: BotOff,
    title: "No auto-applying",
    body: "Applications are written and sent by you. This is a logbook, not a robot.",
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
    status: "interviewing",
    displayStatus: "interviewing",
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

/**
 * Communication/office icon pool and concentric orbit rings around the hero
 * ghost — an "email tornado". Each ring spins at its own speed (faster near
 * the center, like a vortex) and fades the further it gets from the ghost.
 * Icons grow outward and are rotated so their bottoms face the ghost.
 */
const CLOUD_POOL: LucideIcon[] = [
  Mail,
  Phone,
  Calendar,
  MessageSquare,
  Users,
  Clock,
  Paperclip,
  FileText,
  Send,
  Video,
  Briefcase,
  Globe,
  Bell,
  BookOpen,
  Coffee,
  Tag,
];

/**
 * radius (px), icon count, icon size (px), opacity, spin duration (s),
 * start-angle offset (radians, so rings don't line up at start) and a
 * per-ring pool shuffle so the icon sequence begins differently.
 *
 * Ring gaps grow incrementally outward — each gap clears the adjacent
 * icons ((sizeA + sizeB) / 2 plus a growing margin), so the big outer
 * icons never overlap their neighbours.
 */
const CLOUD_RINGS: {
  radius: number;
  count: number;
  size: number;
  opacity: number;
  duration: number;
  offset: number;
  poolOffset: number;
}[] = [
  { radius: 84, count: 8, size: 24, opacity: 0.18, duration: 48, offset: 0, poolOffset: 0 },
  { radius: 129, count: 10, size: 34, opacity: 0.12, duration: 66, offset: 0.3, poolOffset: 5 },
  { radius: 191.5, count: 12, size: 47, opacity: 0.08, duration: 84, offset: 0.72, poolOffset: 11 },
  { radius: 276, count: 14, size: 64, opacity: 0.05, duration: 102, offset: 1.1, poolOffset: 3 },
  { radius: 388, count: 16, size: 86, opacity: 0.035, duration: 120, offset: 1.45, poolOffset: 13 },
  { radius: 533, count: 18, size: 112, opacity: 0.02, duration: 138, offset: 1.9, poolOffset: 7 },
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
        {/* Hero — inverted purple band (overflow hidden clips the icon cloud). */}
        <section className="relative overflow-hidden bg-gradient-to-b from-violet-600 to-violet-700 px-4 pb-32 pt-16 text-center sm:pt-24">
          <div
            className="relative mx-auto flex h-32 w-32 items-center justify-center"
            aria-hidden
          >
            {/* Rotating "email tornado" icon rings around the ghost — first
                child so the ghost, headline and CTAs render on top. */}
            {CLOUD_RINGS.map((ring, ri) => (
              <div
                key={ri}
                className="icon-cloud-ring pointer-events-none absolute left-1/2 top-1/2 text-zinc-950"
                style={{
                  width: ring.radius * 2,
                  height: ring.radius * 2,
                  opacity: ring.opacity,
                  animationDuration: `${ring.duration}s`,
                }}
              >
                {Array.from({ length: ring.count }, (_, j) => {
                  const a =
                    ring.offset + (j / ring.count) * Math.PI * 2;
                  const Icon =
                    CLOUD_POOL[
                      (Math.floor((j * CLOUD_POOL.length) / ring.count) +
                        ring.poolOffset) %
                        CLOUD_POOL.length
                    ];
                  // Bottom edge of the icon sits on the orbit circle.
                  const placeR = ring.radius + ring.size / 2;
                  return (
                    <span
                      key={j}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      style={{
                        left: `calc(50% + ${Math.cos(a) * placeR}px)`,
                        top: `calc(50% + ${Math.sin(a) * placeR}px)`,
                      }}
                    >
                      {/* Rotated so the icon's bottom faces the ghost. */}
                      <span
                        className="block"
                        style={{
                          transform: `rotate(${(a * 180) / Math.PI + 90}deg)`,
                        }}
                      >
                        <Icon size={ring.size} />
                      </span>
                    </span>
                  );
                })}
              </div>
            ))}
            <HeroGhost className="ghost-float h-24 w-24 text-white" />
            <span className="ghost-shadow absolute bottom-0 left-1/2 h-2.5 w-16 -translate-x-1/2 rounded-full bg-violet-950/50 blur-[2px]" />
          </div>
          {/* Text is positioned (relative) so it paints above the tornado's
              positioned ghost wrapper, keeping the rings behind the copy. */}
          <h1 className="relative mx-auto mt-6 max-w-2xl text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Never let a job application go quiet on you.
          </h1>
          <p className="relative mx-auto mt-4 max-w-xl text-violet-100">
            Ghosted keeps every application, interview and offer on one clear
            timeline — and gently reminds you of the ones that went silent.
            Your job hunt, without the ghosting.
          </p>
          <div className="relative mt-8 flex items-center justify-center gap-3">
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

        {/* Product mock — the real dashboard cards, overlapping the hero edge.
            Positioned (relative) so it paints above the positioned hero
            section instead of being hidden behind it. */}
        <div className="relative mx-auto -mt-20 max-w-xl px-4 pb-12" aria-hidden>
          <div className="rounded-xl border bg-card p-4 text-left shadow-2xl">
            <div className="mb-3 flex gap-1 overflow-hidden rounded-lg border bg-muted/50 p-1">
              <MockTab status="applied" title="Applied" count={1} active />
              <MockTab status="interviewing" title="Interviewing" count={2} />
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
          className="mx-auto max-w-5xl px-4 py-12"
        >
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Everything a job hunt needs, nothing it doesn&apos;t
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card
                key={f.title}
                className="bg-gradient-to-br from-card to-violet-100/40 dark:to-violet-950/40"
              >
                <CardContent className="p-5">
                  <f.icon className="h-5 w-5 text-violet-500" aria-hidden />
                  <h3 className="mt-3 font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* What we're not doing */}
        <section
          aria-label="What we're not doing"
          className="mx-auto max-w-5xl px-4 pb-24 pt-12"
        >
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            What we&apos;re not doing
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
            Ghosted is a logbook for your job hunt — not an automation
            software. A simple tool for simple needs.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {NOT_DOING.map((item) => (
              <Card
                key={item.title}
                className="bg-gradient-to-br from-card to-violet-100/40 dark:to-violet-950/40"
              >
                <CardContent className="p-5">
                  <item.icon className="h-5 w-5 text-violet-500" aria-hidden />
                  <h3 className="mt-3 font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA band */}
        <section className="border-t bg-muted/40">
          <div className="mx-auto max-w-3xl px-4 py-12 text-center">
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
