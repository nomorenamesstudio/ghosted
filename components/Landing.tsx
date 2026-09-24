import Link from "next/link";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Briefcase,
  Calendar,
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
 * The mascot poses, all 1024×1024 flat vectors on a transparent ground, drawn
 * for this product: the sad one holds a phone and stares at it, `confused`
 * scratches its head under a question mark, `content` is calm, `finger-guns`
 * winks, and the happy one is the phone ghost finally getting an answer. They
 * carry the tiles where the product has a feeling; the two policy tiles keep
 * plain glyphs, because terms of service do not have a face.
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
 * with a drawn silence panel, the timeline a 2×1 with the five-step rail, and
 * only the smaller features stay square. `span` is the desktop footprint, `art`
 * the mascot that fronts the tile, `visual` the drawing that carries it.
 */
const FEATURES: {
  icon?: LucideIcon;
  art?: string;
  title: string;
  body: string;
  span: string;
  visual?: "silence" | "steps";
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
    art: ART.fingerGuns,
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
          "hidden rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums sm:inline",
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
          <span className="ml-1 truncate rounded-md bg-background/80 px-2 py-0.5 font-mono text-[11px] tracking-tight text-muted-foreground">
            ghosted.lostsignals.studio
          </span>
        </div>

        {/* Cropped at the bottom: the log keeps going past the frame. */}
        <div className="max-h-[25rem] overflow-hidden p-4 sm:max-h-[29rem] sm:p-5">
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
    <div aria-hidden className="mt-8">
      <div className="flex items-end gap-1.5">
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-12 flex-1 rounded-[4px] border sm:h-16 lg:h-20",
              i < 6
                ? "border-violet-300/70 bg-violet-500/25 dark:border-violet-700/60 dark:bg-violet-500/20"
                : "border-dashed border-border bg-muted/40",
            )}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.12em]">
        <span className="text-muted-foreground">Day 1 → 10</span>
        <span className="-rotate-[4deg] rounded-md border-2 border-violet-500/70 px-2 py-1 font-bold text-violet-600 dark:border-violet-400/70 dark:text-violet-300">
          Ghosted
        </span>
      </div>
      {/* The setting that drives the whole tile, shown as the control it is. */}
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
 * The timeline tile's drawing: the five fixed steps as one rail, two of them
 * done, the third in progress. No dates — the point is the fixed shape.
 */
function StepRail() {
  const steps = ["Application", "HR Screen", "Technical Interview", "Test", "Offer"];
  return (
    <div aria-hidden className="mt-auto pt-10">
      <div className="flex items-center">
        {steps.map((step, i) => (
          <span key={step} className="flex flex-1 items-center last:flex-none">
            <span
              className={cn(
                "h-3 w-3 shrink-0 rounded-full border",
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
      <div className="mt-4 flex items-baseline justify-between gap-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          5 fixed steps
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
        {/* Hero — inverted purple band, copy left and the framed product shot
            right. Left-aligned with the CTA in it: a centred hero is the default
            shape, and the asymmetry is what makes this section carry the page.
            The icon tornado is anchored on the ghost, not the viewport, and
            `overflow-hidden` clips the outer rings. */}
        <section className="relative overflow-hidden bg-gradient-to-b from-violet-600 to-violet-700">
          <div className="mx-auto w-full max-w-6xl px-5 pb-24 pt-12 sm:px-6 sm:pt-16 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-16 lg:pb-28 lg:pt-20">
            <div>
              <h1 className="text-[2rem] font-bold leading-[1.06] tracking-[-0.02em] text-white sm:text-[2.5rem] lg:text-[3.25rem]">
                Never let a job application go quiet on you.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-violet-100 sm:text-lg">
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

            {/* Product shot column. The ghost, its shadow and the icon tornado
                are siblings inside one ghost-sized box, so the rings are centred
                on the character and the shadow sits at its hem by construction —
                anchoring them independently is what had them drifting apart.
                Same character as the app icon and the social card, drawn full
                body on a transparent ground, which is why nothing here is tinted
                by the OS. An illustration rather than a silhouette, hence an
                image: 11 kB of paths drawn at their own size, so next/image would
                only add its runtime and a re-encode hop, the same call as the
                mock logos. Decorative, so an empty alt. */}
            <div className="relative mt-20 sm:mt-24 lg:mt-0">
              <div className="relative">
                <div className="pointer-events-none absolute -top-16 left-3 h-24 w-24 sm:-top-20 sm:h-28 sm:w-28 lg:-top-24 lg:left-1 lg:h-32 lg:w-32">
                  {/* Rings, centred on the ghost: the 0×0 anchor is the centre. */}
                  <IconTornado className="left-1/2 top-1/2" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ART.sad}
                    alt=""
                    aria-hidden
                    className="ghost-float relative z-20 h-full w-full drop-shadow-lg"
                  />
                  <span
                    aria-hidden
                    className="ghost-shadow absolute -bottom-1 left-1/2 h-2.5 w-3/5 -translate-x-1/2 rounded-full bg-violet-950/45 blur-[3px]"
                  />
                </div>
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
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6 sm:py-24">
            <h2 className="max-w-2xl text-2xl font-bold leading-[1.15] tracking-[-0.02em] sm:text-3xl">
              What we&apos;re not doing
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-lg">
              Ghosted is a logbook for your job hunt — not an automation
              software. A simple tool for simple needs.
            </p>
            <ul className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
              {NOT_DOING.map((item) => (
                <li key={item.title}>
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800/80 text-zinc-400"
                    >
                      <X className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="text-lg font-semibold tracking-[-0.01em] text-zinc-100">
                      {item.title}
                    </h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA band — one job, one button, and the payoff pose: the same ghost
            as the hero, this time holding a phone that answered. */}
        <section className="relative overflow-hidden bg-gradient-to-b from-violet-600 to-violet-700">
          <div className="mx-auto w-full max-w-2xl px-5 py-16 text-center sm:px-6 sm:py-24">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ART.happy}
              alt=""
              aria-hidden
              className="ghost-float mx-auto h-24 w-24 drop-shadow-lg sm:h-28 sm:w-28"
            />
            <h2 className="mt-6 text-2xl font-bold leading-[1.15] tracking-[-0.02em] text-white sm:text-3xl">
              Ready to stop getting ghosted?
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-violet-100 sm:text-lg">
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
