import Link from "next/link";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Briefcase,
  Calendar,
  ClipboardList,
  Clock,
  Coffee,
  FileText,
  Ghost,
  Globe,
  LayoutGrid,
  Mail,
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
  X,
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
import { StatusIcon } from "./status-icons";
import type { ApplicationListItem } from "@/lib/api";

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
 * The feature tiles are a bento, not six equal cards: the differentiator gets a
 * 2×2 tile with a visual, the timeline gets a 2×1, and only the small ones stay
 * square. `span` is the desktop grid footprint, `visual` picks the little
 * drawing that carries the tile. Order matters — Ghosted detection is the hook
 * and reads first.
 */
const FEATURES: {
  icon: LucideIcon;
  title: string;
  body: string;
  span: string;
  visual?: "silence" | "steps";
}[] = [
  {
    icon: Ghost,
    title: "Ghosted detection",
    body: "Applications the employer has gone quiet on float into their own section once they pass your patience window — 10 days by default, and you set the pace.",
    span: "sm:col-span-2 lg:col-span-2 lg:row-span-2",
    visual: "silence",
  },
  {
    icon: ClipboardList,
    title: "One timeline per application",
    body: "Start with the 5 standard steps — Application, HR Screen, Technical Interview, Test, Offer — and add your own as the process grows.",
    span: "sm:col-span-2 lg:col-span-2",
    visual: "steps",
  },
  {
    icon: LayoutGrid,
    title: "A board or a list",
    body: "The same applications as a Kanban board you drag through the stages, or a grouped list you scan top down. Your call, and it remembers.",
    span: "",
  },
  {
    icon: Star,
    title: "Favourites first",
    body: "Pin the applications that matter most and they always stay on top of their section.",
    span: "",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    body: "Your data stays yours: export everything as JSON or delete your account permanently, any time (GDPR friendly).",
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
const NOT_DOING = [
  {
    title: "No notifications",
    body: "No pings, no push alerts, no inbox noise — you open the log when you feel like it.",
  },
  {
    title: "No email scanning",
    body: "Your mailbox stays yours. Ghosted only knows what you type into it.",
  },
  {
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
        "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide sm:px-2 sm:text-xs",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground",
      )}
    >
      <StatusIcon status={status} className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{title}</span>
      {/* The count is the first thing to go on a phone: three tabs do not fit
          at 390px with it, and a clipped tab reads as broken. */}
      <span
        className={cn(
          "hidden rounded-full px-1.5 py-0.5 text-[10px] tabular-nums sm:inline",
          active ? "bg-muted" : "bg-muted/60",
        )}
      >
        {count}
      </span>
    </span>
  );
}

/**
 * The rotating icon tornado, anchored at a point (`0×0` box) rather than filling
 * the hero: in the two-column hero it swirls around the ghost in the right
 * column, so the rings have to be centred on the character, not the viewport.
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
                {/* Rotated so the icon's bottom faces the ghost. */}
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
 * The hero's product shot: the real dashboard cards inside a fake app window.
 * A framed window is what makes a marketing page read "real product" instead of
 * "four floating cards", so it carries app chrome (traffic lights and a URL
 * bar), two offset panels behind it for depth, and a hard crop at the bottom —
 * the list continues past the frame. Decorative in full: `aria-hidden`, since
 * every word in it is repeated in the copy around it.
 */
function ProductWindow() {
  return (
    <div aria-hidden className="relative">
      {/* Panels behind the window: depth without another screenshot to keep
          truthful. */}
      <div className="absolute inset-x-2 -bottom-3 top-8 rotate-[1.6deg] rounded-2xl border border-white/15 bg-white/[0.06]" />
      <div className="absolute inset-x-5 -bottom-6 top-16 rotate-[3.2deg] rounded-2xl border border-white/10 bg-white/[0.04]" />

      <div className="relative overflow-hidden rounded-2xl border border-white/25 bg-card shadow-2xl lg:-rotate-[1.2deg]">
        {/* App chrome */}
        <div className="flex items-center gap-2 border-b bg-muted/60 px-3 py-2">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          </span>
          <span className="ml-1 truncate rounded-md bg-background/80 px-2 py-0.5 text-[11px] text-muted-foreground">
            ghosted.lostsignals.studio
          </span>
        </div>

        {/* Cropped at the bottom: the log keeps going past the frame. */}
        <div className="max-h-[25rem] overflow-hidden p-4 sm:max-h-[29rem]">
          <div className="mb-3 flex gap-1 overflow-hidden rounded-lg border bg-muted/50 p-1">
            <MockTab status="applied" title="Applied" count={1} active />
            <MockTab status="interviewing" title="Interviewing" count={2} />
            <MockTab status="ghosted" title="Ghosted" count={1} />
          </div>
          <ul className="space-y-2">
            {MOCK_APPS.map((app) => (
              <li key={app.id}>
                {/* Static twin of the real card: same shell, same classes, but
                    no client boundary. The logo is a plain <img> of the file in
                    public/landing-logos (the mock has no application row for
                    /logos/<id> to look up), and the timestamp is formatted here
                    on the server instead of in the browser. */}
                <ApplicationCardShell
                  status={app.displayStatus}
                  company={app.company}
                  role={app.role}
                  isFavorite={app.isFavorite}
                  currentRound={app.currentRound}
                  updatedLabel={`Updated ${formatDistanceToNow(
                    new Date(app.updatedAt),
                    { addSuffix: true },
                  )}`}
                  progress={app.progress}
                  milestoneCount={app.milestoneCount}
                  avatar={
                    // A local file from public/landing-logos, 0.6–2.6 kB and
                    // already the size it is drawn at: next/image would add its
                    // own client runtime and an optimisation hop for nothing.
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
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * The Ghosted tile's little drawing: ten day marks, the last one stamped. It is
 * the differentiator in one glance — count the days, then the stamp arrives.
 */
function SilenceMarks() {
  return (
    <div aria-hidden className="mt-auto pt-8">
      <div className="flex items-end gap-1.5">
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-10 flex-1 rounded-[3px] border sm:h-12",
              i < 6
                ? "border-violet-300/70 bg-violet-500/25 dark:border-violet-700/60 dark:bg-violet-500/20"
                : "border-dashed border-border bg-muted/40",
            )}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[0.8125rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Day 1 → 10
        </span>
        <span className="-rotate-[4deg] rounded-md border-2 border-violet-500/70 px-2 py-0.5 text-[0.8125rem] font-bold uppercase tracking-[0.14em] text-violet-600 dark:border-violet-400/70 dark:text-violet-300">
          Ghosted
        </span>
      </div>
    </div>
  );
}

/**
 * The timeline tile's drawing: the five fixed steps as one rail, two of them
 * done, the third in progress. No dates — the point is the fixed shape.
 */
function StepRail() {
  const steps = ["Application", "HR Screen", "Technical Interview", "Test", "Offer"];
  return (
    <div aria-hidden className="mt-5">
      <div className="flex items-center">
        {steps.map((step, i) => (
          <span key={step} className="flex flex-1 items-center last:flex-none">
            <span
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full border",
                i < 2
                  ? "border-violet-500 bg-violet-500"
                  : i === 2
                    ? "border-violet-500 bg-background ring-2 ring-violet-500/25"
                    : "border-border bg-background",
              )}
            />
            {i < steps.length - 1 && (
              <span
                className={cn(
                  "h-px flex-1",
                  i < 2 ? "bg-violet-500" : "bg-border",
                )}
              />
            )}
          </span>
        ))}
      </div>
      <div className="mt-2.5 flex justify-between text-[0.8125rem] text-muted-foreground">
        <span>Application</span>
        <span className="text-foreground">Technical Interview</span>
        <span>Offer</span>
      </div>
    </div>
  );
}

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
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
        {/* Hero — inverted purple band, copy left and the framed product shot
            right. Left-aligned with the CTA in it: a centred hero is the default
            shape, and the asymmetry is what makes this section carry the page.
            The icon tornado is anchored on the ghost, not the viewport, and
            `overflow-hidden` clips the outer rings. */}
        <section className="relative overflow-hidden bg-gradient-to-b from-violet-600 to-violet-700">
          <div className="mx-auto max-w-6xl px-4 pb-20 pt-10 sm:pt-14 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-12 lg:pb-28">
            <div className="lg:pb-4">
              <h1 className="text-[clamp(2.5rem,6vw,4.5rem)] font-bold leading-[1.05] tracking-[-0.02em] text-white">
                Never let a job application go quiet on you.
              </h1>
              <p className="mt-5 max-w-[52ch] text-[1.125rem] leading-relaxed text-violet-100 sm:text-[1.25rem]">
                A simple logbook for your jobhunt. Every application, interview
                and ghosting on one timeline. Nothing more, nothing less.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Button
                  size="lg"
                  className="bg-white text-violet-700 shadow-lg hover:bg-violet-100"
                  asChild
                >
                  <Link href="/register">Start tracking free</Link>
                </Button>
                <Link
                  href="#features"
                  className="group inline-flex items-center gap-1.5 rounded-md text-[0.9375rem] font-medium text-violet-100 underline decoration-violet-300/50 underline-offset-4 transition-colors hover:text-white hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-violet-700"
                >
                  See how it works
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              </div>
            </div>

            {/* Product shot column: the ghost floats above the window with the
                tornado behind it, so the character owns its own space instead of
                sitting on the app chrome. Same character as the app icon and the
                social card, drawn full body on a transparent ground
                (`public/staring-at-phone-sad.svg`), which is why nothing here is
                tinted by the OS. It is an illustration rather than a silhouette,
                hence an image: 11 kB of paths drawn at their own size, so
                next/image would only add its runtime and a re-encode hop, the
                same call as the mock logos. Decorative, so an empty alt. */}
            <div className="relative mt-14 pt-20 lg:mt-0 lg:pt-28">
              <IconTornado className="left-[8%] top-[4%] lg:left-[10%] lg:top-[2%]" />
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/staring-at-phone-sad.svg"
                  alt=""
                  aria-hidden
                  className="ghost-float absolute -top-24 left-4 z-20 h-28 w-28 sm:h-32 sm:w-32 lg:-top-28 lg:left-2 lg:h-36 lg:w-36"
                />
                <span
                  aria-hidden
                  className="ghost-shadow absolute -top-8 left-4 z-10 h-2.5 w-20 rounded-full bg-violet-950/50 blur-[2px] sm:left-5 sm:w-24 lg:-top-10 lg:left-3"
                />
                <div className="relative z-10">
                  <ProductWindow />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features — a bento, not six equal cards: the differentiator is a big
            tile, the timeline is wide, the rest stay small. Section rhythm is
            py-16/py-24 everywhere, so the page breathes at one pace. */}
        <section
          id="features"
          aria-label="Features"
          className="mx-auto max-w-5xl scroll-mt-20 px-4 py-16 sm:py-24"
        >
          <h2 className="max-w-3xl text-[clamp(1.75rem,3.5vw,2.5rem)] font-bold leading-[1.15] tracking-[-0.02em]">
            Everything a job hunt needs, nothing it doesn&apos;t
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:mt-12">
            {FEATURES.map((f) => (
              <Card
                key={f.title}
                className={cn(
                  "flex flex-col bg-gradient-to-br from-card to-violet-100/40 dark:to-violet-950/40",
                  f.span,
                )}
              >
                <CardContent className="flex flex-1 flex-col p-5 sm:p-6">
                  <f.icon className="h-5 w-5 text-violet-500" aria-hidden />
                  <h3
                    className={cn(
                      "mt-4 font-semibold tracking-[-0.01em]",
                      f.visual ? "text-[1.125rem] sm:text-[1.25rem]" : "text-[0.9375rem]",
                    )}
                  >
                    {f.title}
                  </h3>
                  <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">
                    {f.body}
                  </p>
                  {f.visual === "silence" && <SilenceMarks />}
                  {f.visual === "steps" && <StepRail />}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* What we're not doing — the page's personality, so it gets its own
            weight: a dark band in both themes, a statement-sized heading, and
            the refusals as large text with a cross instead of three more cards. */}
        <section
          aria-label="What we're not doing"
          className="border-y border-zinc-800 bg-zinc-950 text-zinc-50 dark:bg-zinc-900"
        >
          <div className="mx-auto max-w-5xl px-4 py-16 sm:py-24">
            <h2 className="max-w-3xl text-[clamp(1.75rem,3.5vw,2.5rem)] font-bold leading-[1.15] tracking-[-0.02em]">
              What we&apos;re not doing
            </h2>
            <p className="mt-4 max-w-[52ch] text-[1.125rem] leading-relaxed text-zinc-400 sm:text-[1.25rem]">
              Ghosted is a logbook for your job hunt — not an automation
              software. A simple tool for simple needs.
            </p>
            <ul className="mt-12 grid gap-8 sm:grid-cols-3 sm:gap-6">
              {NOT_DOING.map((item) => (
                <li key={item.title}>
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800/80 text-zinc-400"
                    >
                      <X className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="text-[1.125rem] font-semibold tracking-[-0.01em] text-zinc-100 sm:text-[1.25rem]">
                      {item.title}
                    </h3>
                  </div>
                  <p className="mt-3 text-[0.9375rem] leading-relaxed text-zinc-400">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA band — one job, one button: the purple is the page's bookend. */}
        <section className="relative overflow-hidden bg-gradient-to-b from-violet-600 to-violet-700">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-24">
            <h2 className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-bold leading-[1.15] tracking-[-0.02em] text-white">
              Ready to stop getting ghosted?
            </h2>
            <p className="mx-auto mt-4 max-w-[52ch] text-[1.125rem] leading-relaxed text-violet-100 sm:text-[1.25rem]">
              Create your free account and start your first timeline in under a
              minute.
            </p>
            <Button
              size="lg"
              className="mt-8 bg-white text-violet-700 shadow-lg hover:bg-violet-100"
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
