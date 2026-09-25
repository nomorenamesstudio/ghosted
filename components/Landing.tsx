import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Bell,
  BellOff,
  BookOpen,
  BotOff,
  Briefcase,
  Calendar,
  Clock,
  Coffee,
  ExternalLink,
  FileText,
  Ghost,
  Globe,
  Mail,
  MailX,
  MessageSquare,
  Paperclip,
  Phone,
  Plug,
  Send,
  Server,
  ShieldCheck,
  Tag,
  Users,
  Video,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
// The card *shell*, not ApplicationCardView: the real card is a client component
// (live relative timestamps, Radix avatar and progress), and rendering it here
// pulled date-fns, Radix Progress and Radix Avatar onto the marketing page for
// four decorative cards. The shell is a server component, so those stay on the
// dashboard, and the look is identical because it is literally the same markup.
import { ApplicationCardShell } from "./ApplicationCardShell";
import { AppBrand } from "./AppBrand";
import type { ApplicationListItem } from "@/lib/api";

const REPO_URL = "https://github.com/krisztianhadi/ghosted";

/**
 * The mock cards name real companies, so they carry their real icons. Shipped as
 * static files under public/landing-logos so the landing page stays static and
 * never calls a favicon service at runtime.
 */
const MOCK_LOGOS: Record<string, string> = {
  Stripe: "/landing-logos/stripe.png",
  Vercel: "/landing-logos/vercel.png",
  Linear: "/landing-logos/linear.jpg",
  Framer: "/landing-logos/framer.jpg",
};

/**
 * The mascot poses, all 1024×1024 flat vectors on a transparent ground, drawn
 * for this product: the sad one stares at its phone, `confused` scratches its
 * head under a question mark, `content` is calm, `finger-guns` winks, and the
 * happy one is the phone ghost finally getting an answer. Three drift through
 * the hero, one fronts the timeline tile, and the happy one closes the page.
 */
const ART = {
  sad: "/staring-at-phone-sad.svg",
  confused: "/confused.svg",
  content: "/content.svg",
  fingerGuns: "/finger-guns.svg",
  happy: "/staring-at-phone-happy.svg",
} as const;

/**
 * Features are a bento, not six equal cards: the differentiator takes a 2×2 tile
 * with a drawn silence panel, the timeline a 2×1 with the step rail, and the
 * small ones stay square. `span` is the desktop footprint, `art` the mascot that
 * fronts the tile, `visual` the drawing that carries it, `href` an optional link.
 */
const FEATURES: {
  icon?: LucideIcon;
  art?: string;
  title: string;
  body: ReactNode;
  span: string;
  visual?: "silence" | "steps";
  href?: string;
  hrefLabel?: string;
}[] = [
  {
    art: ART.confused,
    title: "Ghosted detection",
    body: "Applications the employer has gone quiet on float into their own section once they pass your patience window — 10 days by default, and you set the pace.",
    span: "sm:col-span-2 lg:col-span-2 lg:row-span-2",
    visual: "silence",
  },
  {
    art: ART.content,
    title: "One timeline per application",
    body: "Start with the 5 usual steps and add as many as the process actually needs — a second technical round, a take-home review, a team chat.",
    span: "sm:col-span-2 lg:col-span-2",
    visual: "steps",
  },
  {
    icon: Server,
    title: "Self-hostable",
    body: "One container and a Postgres, migrations on start: clone the repo and run it on your own box if you would rather not trust anyone's server, ours included.",
    span: "",
    href: REPO_URL,
    hrefLabel: "krisztianhadi/ghosted",
  },
  {
    icon: Plug,
    title: "MCP, coming soon",
    body: "An MCP server is on the way, so your own agent can do the filing — log an application, tick off a step, add a note — while you get on with the applying.",
    span: "",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    body: "No public profile, no ads, nothing sold. Download everything as JSON or delete the account for good, and the analytics are self-hosted. It is a logbook, not a vault — no encryption claims beyond the database it sits in.",
    span: "sm:col-span-2 lg:col-span-2",
  },
  {
    icon: Wallet,
    title: "Free forever",
    body: "Job hunting is a pain already — the log shouldn't cost you too. Free for casual use, always.",
    span: "sm:col-span-2 lg:col-span-2",
  },
];

/** Things Ghosted deliberately does NOT do — a logbook, not automation. */
const NOT_DOING: { icon: LucideIcon; title: string; body: string }[] = [
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
    company: "Stripe",
    role: "Senior Engineer",
    url: null,
    companyWebsite: null,
    status: "interviewing",
    displayStatus: "interviewing",
    isFavorite: true,
    totalSteps: 5,
    updatedAt: new Date(now - 2 * DAY),
    progress: 60,
    currentRound: "Technical Interview",
    milestoneCount: 5,
  },
  {
    id: "preview-vercel",
    company: "Vercel",
    role: "Frontend Engineer",
    url: null,
    companyWebsite: null,
    status: "interviewing",
    displayStatus: "interviewing",
    isFavorite: false,
    totalSteps: 5,
    updatedAt: new Date(now - 3 * DAY),
    progress: 40,
    currentRound: "HR Screen",
    milestoneCount: 5,
  },
  {
    id: "preview-linear",
    company: "Linear",
    role: "Product Engineer",
    url: null,
    companyWebsite: null,
    status: "applied",
    displayStatus: "applied",
    isFavorite: false,
    totalSteps: 5,
    updatedAt: new Date(now - 1 * DAY),
    progress: 20,
    currentRound: "Application",
    milestoneCount: 5,
  },
  {
    id: "preview-framer",
    company: "Framer",
    role: "Product Designer",
    url: null,
    companyWebsite: null,
    status: "applied",
    displayStatus: "ghosted",
    isFavorite: false,
    totalSteps: 5,
    updatedAt: new Date(now - 15 * DAY),
    progress: 20,
    currentRound: "Application",
    milestoneCount: 5,
  },
];

/**
 * Communication/office icon pool and concentric orbit rings around the hero
 * — an "email tornado". Each ring spins at its own speed (faster near the
 * center, like a vortex) and fades the further it gets from the ghost. Icons
 * grow outward and are rotated so their bottoms face the centre.
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
  { radius: 84, count: 8, size: 24, opacity: 0.16, duration: 48, offset: 0, poolOffset: 0 },
  { radius: 129, count: 10, size: 34, opacity: 0.11, duration: 66, offset: 0.3, poolOffset: 5 },
  { radius: 191.5, count: 12, size: 47, opacity: 0.075, duration: 84, offset: 0.72, poolOffset: 11 },
  { radius: 276, count: 14, size: 64, opacity: 0.05, duration: 102, offset: 1.1, poolOffset: 3 },
  { radius: 388, count: 16, size: 86, opacity: 0.035, duration: 120, offset: 1.45, poolOffset: 13 },
  { radius: 533, count: 18, size: 112, opacity: 0.02, duration: 138, offset: 1.9, poolOffset: 7 },
];

/**
 * The rotating icon tornado, anchored at a point (`0×0` box) rather than filling
 * the hero: it spins behind the floating pile, so the rings are centred on the
 * pile's middle, not the viewport.
 */
function IconTornado({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute h-0 w-0", className)}>
      {CLOUD_RINGS.map((ring, ri) => (
        <div
          key={ri}
          className="icon-cloud-ring pointer-events-none text-zinc-950"
          style={{
            width: ring.radius * 2,
            height: ring.radius * 2,
            opacity: ring.opacity,
            animationDuration: `${ring.duration}s`,
          }}
        >
          {Array.from({ length: ring.count }, (_, j) => {
            const a = ring.offset + (j / ring.count) * Math.PI * 2;
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
                {/* Rotated so the icon's bottom faces the centre. */}
                <span
                  className="block"
                  style={{ transform: `rotate(${(a * 180) / Math.PI + 90}deg)` }}
                >
                  <Icon size={ring.size} />
                </span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * The fake app chrome: traffic lights and a URL. Decorative wherever it appears,
 * so it is `aria-hidden` — the thing it frames carries the meaning.
 */
function AppChrome() {
  return (
    <div
      aria-hidden
      className="flex items-center gap-2 border-b bg-muted/60 px-3 py-2"
    >
      <span className="flex gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
      </span>
      <span className="ml-1 truncate rounded-md bg-background/80 px-2 py-0.5 font-mono text-[11px] tracking-tight text-muted-foreground">
        ghosted.lostsignals.studio
      </span>
    </div>
  );
}

/**
 * One application card, adrift. The rotation lives on the wrapper and the bob on
 * the inner element, because the keyframes own `transform` — putting both on one
 * element silently drops the rotation.
 */
function FloatingCard({
  app,
  className,
  delay = "0s",
}: {
  app: ApplicationListItem;
  className: string;
  delay?: string;
}) {
  return (
    <div className={cn("absolute", className)}>
      <div
        className="float-bob rounded-lg shadow-xl shadow-violet-950/20"
        style={{ animationDelay: delay }}
      >
        <ApplicationCardShell
          // `compact` is the board's own narrow-card layout: at this width the
          // wide card's single meta line truncates to "Last r…", which is what a
          // floating card must not look like.
          compact
          status={app.displayStatus}
          company={app.company}
          role={app.role}
          isFavorite={app.isFavorite}
          currentRound={app.currentRound}
          updatedLabel={`Updated ${formatDistanceToNow(new Date(app.updatedAt), {
            addSuffix: true,
          })}`}
          progress={app.progress}
          milestoneCount={app.milestoneCount}
          avatar={
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={MOCK_LOGOS[app.company]}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-9 w-9 shrink-0 rounded-lg object-contain"
            />
          }
        />
      </div>
    </div>
  );
}

/** One mascot, adrift: rotation on the wrapper, bob on the image. */
function FloatingGhost({
  src,
  className,
  delay = "0s",
}: {
  src: string;
  className: string;
  delay?: string;
}) {
  return (
    <div className={cn("absolute", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden
        className="float-bob h-full w-full drop-shadow-md"
        style={{ animationDelay: delay }}
      />
    </div>
  );
}

/**
 * The Ghosted tile's drawing: ten calendar days, the last one stamped. It is the
 * differentiator in one glance — count the days, then the stamp arrives — and the
 * patience control underneath is the setting that decides when it lands.
 */
function SilenceCalendar() {
  return (
    <div aria-hidden className="mt-8">
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "flex aspect-square items-center justify-center rounded-[4px] border font-mono text-[10px] tabular-nums sm:text-[11px]",
              i < 6
                ? "border-violet-300/70 bg-violet-500/20 text-violet-700 dark:border-violet-700/60 dark:bg-violet-500/15 dark:text-violet-300"
                : "border-dashed border-border bg-muted/40 text-muted-foreground",
            )}
          >
            {i + 1}
          </span>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.12em]">
        <span className="text-muted-foreground">Days 1 → 10</span>
        <span className="-rotate-[4deg] rounded-md border-2 border-violet-500/70 px-2 py-1 font-bold text-violet-600 dark:border-violet-400/70 dark:text-violet-300">
          Ghosted
        </span>
      </div>
      <div className="mt-auto flex items-center gap-2 border-t pt-6">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          Patience
        </span>
        <span className="flex gap-1.5">
          {["7", "10", "14"].map((days) => (
            <span
              key={days}
              className={cn(
                "rounded-md border px-2 py-1 font-mono text-[11px] tabular-nums",
                days === "10"
                  ? "border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                  : "border-border text-muted-foreground",
              )}
            >
              {days}d
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

/**
 * The timeline tile's drawing: a process as long as it needs to be — six steps,
 * two of them done, and an open slot for the next one. Nothing here claims a
 * fixed number of stages.
 */
function StepRail() {
  const done = 2;
  const steps = 6;
  return (
    <div aria-hidden className="mt-8">
      <div className="flex items-center">
        {Array.from({ length: steps }, (_, i) => (
          <span key={i} className="flex flex-1 items-center last:flex-none">
            <span
              className={cn(
                "h-3 w-3 shrink-0 rounded-full border",
                i < done
                  ? "border-violet-500 bg-violet-500"
                  : i === done
                    ? "border-violet-500 bg-background ring-2 ring-violet-500/25"
                    : "border-border bg-background",
              )}
            />
            {i < steps - 1 && (
              <span
                className={cn("h-px flex-1", i < done ? "bg-violet-500" : "bg-border")}
              />
            )}
          </span>
        ))}
        <span className="ml-2 flex h-5 items-center rounded-md border border-dashed border-border px-1.5 font-mono text-[10px] text-muted-foreground">
          +1
        </span>
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          As long as it takes
        </span>
        <span className="text-sm text-foreground">Technical Interview</span>
      </div>
    </div>
  );
}

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5 sm:px-6">
          {/* The same component the app's header renders, rather than a second
              copy of the same markup that drifts the moment either changes. */}
          <AppBrand href="/" />
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
        {/* Hero — inverted purple band, copy left and the pile right: the real
            dashboard cards adrift among the mascots, like the aftermath of a
            small explosion in zero gravity, with the icon tornado spinning behind
            them. Left-aligned with the CTA in the hero: a centred hero is the
            default shape, and the asymmetry is what makes this section lead. */}
        <section className="relative overflow-hidden bg-gradient-to-b from-violet-600 to-violet-700">
          <div className="mx-auto w-full max-w-6xl px-5 pb-24 pt-12 sm:px-6 sm:pt-16 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-12 lg:pb-28 lg:pt-20">
            <div>
              <h1 className="text-[2rem] font-bold leading-[1.06] tracking-[-0.02em] text-white sm:text-[2.5rem] lg:text-[3.25rem]">
                Never let a job application go quiet on you.
              </h1>
              <p className="mt-6 text-base leading-relaxed text-violet-100 sm:text-lg">
                A simple logbook for your jobhunt. Every application, interview
                and ghosting on one timeline. Nothing more, nothing less.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Button
                  size="lg"
                  className="h-12 bg-white px-7 text-base text-violet-700 shadow-xl ring-1 ring-white/40 hover:bg-violet-100"
                  asChild
                >
                  <Link href="/register">Start tracking free</Link>
                </Button>
                <Link
                  href="#features"
                  className="group inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-violet-100 underline decoration-violet-300/50 underline-offset-4 transition-colors hover:text-white hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-violet-700"
                >
                  See how it works
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              </div>
            </div>

            {/* The pile. Everything is absolutely placed inside a sized box, so
                the composition holds at every breakpoint instead of reflowing
                into a column, and the outer rings are clipped by the section.
                The mascots are flat vectors on a transparent ground, which is
                why nothing here is tinted by the OS: illustrations rather than
                silhouettes, hence images rather than inline SVG. */}
            <div className="relative mt-20 h-[26rem] sm:mt-24 sm:h-[30rem] lg:mt-0 lg:h-[34rem]">
              <IconTornado className="left-1/2 top-1/2" />

              {/* The mascots go in first, so the cards paint over them: a ghost
                  drawn on top of a card covers its company name, and "ipe" is
                  not a company. Positioned to peek out above, beside and from
                  under the pile instead. */}
              <FloatingGhost
                src={ART.sad}
                className="right-2 top-2 h-20 w-20 rotate-6 sm:right-auto sm:left-6 sm:-top-2 sm:h-24 sm:w-24"
                delay="-3.4s"
              />
              <FloatingGhost
                src={ART.fingerGuns}
                className="left-2 bottom-2 h-16 w-16 -rotate-6 sm:left-auto sm:right-6 sm:top-6 sm:h-20 sm:w-20"
                delay="-5.6s"
              />
              <FloatingGhost
                src={ART.confused}
                className="-bottom-4 left-6 hidden h-24 w-24 rotate-3 lg:block"
                delay="-2.1s"
              />

              {/* Two cards on a phone, three from sm, four on a wide screen: a
                  pile that only ever shows part of itself reads as clutter, not
                  as zero gravity. Rotations stay shallow at the small sizes so no
                  corner leaves the frame. */}
              <FloatingCard
                app={MOCK_APPS[3]}
                className="bottom-4 right-2 w-[14rem] rotate-2 sm:right-0 sm:w-[16rem] sm:-rotate-3"
                delay="-4.5s"
              />
              <FloatingCard
                app={MOCK_APPS[0]}
                className="left-3 top-6 w-[15rem] -rotate-3 sm:left-0 sm:top-24 sm:w-[18rem] sm:-rotate-6"
                delay="-1.2s"
              />
              <FloatingCard
                app={MOCK_APPS[1]}
                className="hidden right-0 top-44 w-[18rem] rotate-3 lg:block"
                delay="-2.8s"
              />
              <FloatingCard
                app={MOCK_APPS[2]}
                className="hidden bottom-10 left-0 w-[15rem] rotate-2 sm:block sm:w-[17rem]"
                delay="-6.1s"
              />
            </div>
          </div>
        </section>

        {/* The two views, as the app actually looks: board on the left of the
            seam, list on the right, in the same chrome. Two screenshots stitched
            at a vertical split, because a landing page with one view has to
            explain the other in words, and this one does not. */}
        <section
          aria-label="The app"
          className="mx-auto w-full max-w-6xl px-5 pt-16 sm:px-6 sm:pt-24"
        >
          <div className="overflow-hidden rounded-xl border bg-card shadow-xl">
            <AppChrome />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/landing-views/board-list-split.jpg"
              width={1440}
              height={633}
              alt="The Ghosted dashboard: the Kanban board on the left of the seam, the grouped list on the right."
              className="block w-full"
            />
          </div>
        </section>

        {/* Features — a bento, not six equal cards: the differentiator is a big
            tile, the timeline is wide, the rest stay small. Section rhythm is
            py-16/py-24 everywhere, so the page breathes at one pace. */}
        <section
          id="features"
          aria-label="Features"
          className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-16 sm:px-6 sm:py-24"
        >
          <h2 className="max-w-2xl text-2xl font-bold leading-[1.15] tracking-[-0.02em] sm:text-3xl">
            Everything a job hunt needs, nothing it doesn&apos;t
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 sm:mt-14 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <Card
                key={f.title}
                className={cn(
                  "flex flex-col bg-gradient-to-br from-card to-violet-100/40 dark:to-violet-900/40",
                  f.span,
                )}
              >
                <CardContent
                  className={cn(
                    "flex flex-1 flex-col p-6",
                    f.visual && "sm:p-8",
                  )}
                >
                  {f.art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.art}
                      alt=""
                      aria-hidden
                      className={cn(
                        "shrink-0",
                        f.visual ? "h-16 w-16" : "h-12 w-12",
                      )}
                    />
                  ) : f.icon ? (
                    <f.icon className="h-5 w-5 text-violet-500" aria-hidden />
                  ) : null}
                  <h3
                    className={cn(
                      "mt-5 font-semibold tracking-[-0.01em]",
                      f.visual ? "text-lg sm:text-xl" : "text-base",
                    )}
                  >
                    {f.title}
                  </h3>
                  <p
                    className={cn(
                      "mt-2 text-sm leading-relaxed text-muted-foreground",
                      f.visual && "max-w-[46ch]",
                    )}
                  >
                    {f.body}
                  </p>
                  {f.href && (
                    <a
                      href={f.href}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-1.5 rounded-md font-mono text-xs text-violet-700 underline decoration-violet-400/50 underline-offset-4 transition-colors hover:decoration-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:text-violet-300"
                    >
                      {f.hrefLabel}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  )}
                  {f.visual === "silence" && <SilenceCalendar />}
                  {f.visual === "steps" && <StepRail />}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* What we're not doing — the page's personality, so it gets its own
            weight: a dark band in both themes, a statement-sized heading, and the
            refusals as boxes whose mark is the crossed glyph. */}
        <section
          aria-label="What we're not doing"
          className="border-y border-zinc-800 bg-zinc-950 text-zinc-50 dark:bg-zinc-900"
        >
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6 sm:py-24">
            <h2 className="max-w-2xl text-2xl font-bold leading-[1.15] tracking-[-0.02em] sm:text-3xl">
              What we&apos;re not doing
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-lg">
              Ghosted is a logbook for your job hunt — not an automation
              software. A simple tool for simple needs.
            </p>
            <ul className="mt-12 grid gap-5 sm:grid-cols-3 sm:gap-6">
              {NOT_DOING.map(({ icon: Icon, title, body }) => (
                <li
                  key={title}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6"
                >
                  <span
                    aria-hidden
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800/80 text-zinc-300"
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold tracking-[-0.01em] text-zinc-100">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    {body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA band — one job, one button, and the payoff pose: the same ghost as
            the hero, this time holding a phone that answered. */}
        <section className="relative overflow-hidden bg-gradient-to-b from-violet-600 to-violet-700">
          <div className="mx-auto w-full max-w-2xl px-5 py-16 text-center sm:px-6 sm:py-24">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ART.happy}
              alt=""
              aria-hidden
              className="ghost-float mx-auto h-28 w-28 drop-shadow-lg sm:h-36 sm:w-36"
            />
            <h2 className="mt-6 text-3xl font-bold leading-[1.1] tracking-[-0.02em] text-white sm:text-4xl">
              Ready to stop getting ghosted?
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-violet-100 sm:text-lg">
              Create your free account and start your first timeline in under a
              minute.
            </p>
            <Button
              size="lg"
              className="mt-9 h-12 bg-white px-8 text-base text-violet-700 shadow-xl ring-1 ring-white/40 hover:bg-violet-100"
              asChild
            >
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
