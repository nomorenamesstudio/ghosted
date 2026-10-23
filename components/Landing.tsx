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
  ChevronDown,
  Clock,
  Coffee,
  ListChecks,
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
import { LANDING_FAQ, type FaqEntry } from "@/lib/faq";
import { LICENSE_URL, REPO_URL } from "@/lib/site";
// The card *shell*, not ApplicationCardView: the real card is a client component
// (live relative timestamps, Radix avatar and progress), and rendering it here
// pulled date-fns, Radix Progress and Radix Avatar onto the marketing page for
// four decorative cards. The shell is a server component, so those stay on the
// dashboard, and the look is identical because it is literally the same markup.
import { ApplicationCardShell } from "./ApplicationCardShell";
import { AppBrand } from "./AppBrand";
import { LandingMock } from "./LandingMock";
import { LandingThemeFollow } from "./LandingThemeFollow";
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
 * Features are a bento: two wide tiles on top (the differentiator and the
 * timeline, each with its drawing beside the copy) and four squares below. The
 * mascots deliberately stay out of this grid — six tiles of ghost art turned the
 * page into a sticker sheet, and the poses read better in the hero and the CTA.
 */
const FEATURES: {
  icon: LucideIcon;
  title: string;
  body: ReactNode;
  span: string;
  /** Two-column tile on sm and up: bigger padding and a bigger heading. */
  wide?: boolean;
  /** Footer note, prefixed with the repo mark, for tiles that are not released
   *  yet. */
  soon?: boolean;
  /** Footer link where the work already exists — the repo the tile is about. */
  link?: { href: string; label: string };
}[] = [
  {
    icon: Ghost,
    title: "Ghosted detection",
    body: "Applications the employer has gone quiet on float into their own section once they pass your patience window — 10 days by default, and you set the pace.",
    span: "lg:col-span-2",
    wide: true,
  },
  {
    icon: ListChecks,
    title: "One timeline per application",
    body: "Start with the 5 usual steps and add as many as the process actually needs — a second technical round, a take-home review, a team chat.",
    span: "lg:col-span-2",
    wide: true,
  },
  {
    icon: Server,
    title: "Open source",
    body: "MIT-licensed and self-hostable: one container and a Postgres, migrations on start. Run it on your own box if you would rather not trust anyone's server, ours included.",
    span: "",
    link: { href: REPO_URL, label: "View on GitHub" },
  },
  {
    icon: Plug,
    title: "MCP integration",
    body: "Your own agent can do the filing — log an application, tick off a step, add a note — while you get on with the applying.",
    span: "",
    soon: true,
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    body: "No public profile, no ads, nothing sold. Download everything as JSON or delete the account for good, and the analytics are self-hosted.",
    span: "",
  },
  {
    icon: Wallet,
    title: "Free forever",
    body: "Job hunting is a pain already — the log shouldn't cost you too. Free for casual use, always.",
    span: "",
  },
];

/**
 * The comparison table's rows.
 *
 * The middle column describes a typical paid tracker, not one product, and says
 * "rarely" or "usually" where the fact is not mine to state. A comparison that
 * overstates a competitor is the same penalty risk as schema that overstates us,
 * and it is easier to disprove.
 */
const COMPARISON: {
  row: string;
  ghosted: string;
  paid: string;
  sheet: string;
}[] = [
  {
    row: "Price",
    ghosted: "Free, with no paid tier",
    paid: "Usually a monthly subscription",
    sheet: "Free",
  },
  {
    row: "AI in the product",
    ghosted: "None — you write the application",
    paid: "Often the selling point",
    sheet: "None",
  },
  {
    row: "Applications that go quiet",
    ghosted: "Their own section after 10 days",
    paid: "Rarely a feature",
    sheet: "You check by hand",
  },
  {
    row: "Your data",
    ghosted: "One Postgres, JSON export any time",
    paid: "Their database",
    sheet: "Your file",
  },
  {
    row: "Self-hosting",
    ghosted: "Yes — one container and a Postgres",
    paid: "No",
    sheet: "n/a",
  },
  {
    row: "License",
    ghosted: "MIT, source on GitHub",
    paid: "Closed source",
    sheet: "n/a",
  },
  {
    row: "Signing up",
    ghosted: "Email, or Google and LinkedIn",
    paid: "Required, usually billed",
    sheet: "None",
  },
];

/**
 * The GitHub mark, inline. lucide dropped brand icons, and the tile footers are
 * the one place the page needs one; `currentColor` keeps it on the same muted
 * gray as the text beside it.
 */
function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

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

/**
 * FAQ. Native `<details>` rather than a Radix accordion: the answers open
 * without JavaScript, stay keyboard-operable, and screen readers announce them
 * as a disclosure. Panels deliberately do not close each other — weighing "is it
 * really free" against "what's the catch" should not mean re-opening what you
 * just read.
 *
 * The questions and answers live in `lib/faq.ts` as plain text, because the same
 * array is emitted as `FAQPage` structured data — the schema has to say exactly
 * what the page says, and two copies of the copy is how that stops being true.
 * Each question is a real heading inside the disclosure, which is what makes it
 * quotable by an answer engine and navigable by a screen reader.
 */
/**
 * One FAQ answer, with its optional link spliced in at the label it names.
 *
 * The answer stays a plain string so the schema can quote exactly what the page
 * says; the anchor is decoration over the same words, not a second copy.
 */
function FaqAnswer({ entry }: { entry: FaqEntry }) {
  const { a, link } = entry;
  if (!link) return <>{a}</>;

  const at = a.indexOf(link.label);
  if (at === -1) return <>{a}</>;

  return (
    <>
      {a.slice(0, at)}
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className={BODY_LINK}
      >
        {link.label}
      </a>
      {a.slice(at + link.label.length)}
    </>
  );
}

/** Body links in running copy: the app's inline-link color, underlined at rest. */
const BODY_LINK =
  "text-primary underline underline-offset-[3px] transition-colors hover:text-primary/80";


/**
 * Both calls to action are the same button: the same size, weight, lift on hover
 * and the same arrow, so the page reads as one action offered twice rather than
 * two differently-shaped invitations.
 */
const CTA_CLASSES =
  "group h-12 w-full justify-center bg-white px-7 text-base text-violet-700 shadow-xl ring-1 ring-white/40 transition-all duration-200 hover:-translate-y-0.5 hover:bg-violet-100 hover:shadow-2xl motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:w-auto";

const CTA_ARROW =
  "h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none";

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
    status: "applied",
    displayStatus: "applied",
    isFavorite: false,
    totalSteps: 5,
    updatedAt: new Date(now - 3 * DAY),
    progress: 20,
    currentRound: "Application",
    milestoneCount: 5,
  },
  {
    id: "preview-linear",
    company: "Linear",
    role: "Product Engineer",
    url: null,
    companyWebsite: null,
    status: "offer",
    displayStatus: "offer",
    isFavorite: true,
    totalSteps: 5,
    updatedAt: new Date(now - 1 * DAY),
    progress: 100,
    currentRound: "Offer / Decision",
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
 * grow outward and are rotated so their bottoms face the center.
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
 * the hero: it spins behind the floating pile, so the rings are centerd on the
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
                {/* Rotated so the icon's bottom faces the center. */}
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

/** One mascot, adrift: rotation on the wrapper, bob on the image.
 *
 *  The mascot is a flat vector painted at 90%, so the cards it sits on show
 *  through it. A frost layer behind it — the ghost's own silhouette used as a
 *  `mask-image` over a backdrop blur — makes what shows through read as frosted
 *  glass instead of a sharp card seen through a haze. The mask is load-bearing:
 *  an unmasked backdrop blur covers the element's whole box and smears a
 *  rectangle of the card behind the ghost, which looks like a focus bug. The
 *  frost carries the same `float-bob` and delay as the image so the two never
 *  drift apart mid-animation, and it sits *behind* the image because masking
 *  would otherwise clip the image's own drop shadow. */
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
      <div
        aria-hidden
        data-ghost-frost
        className="float-bob absolute inset-0 backdrop-blur"
        style={{
          animationDelay: delay,
          maskImage: `url(${src})`,
          WebkitMaskImage: `url(${src})`,
          maskSize: "contain",
          WebkitMaskSize: "contain",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskPosition: "center",
          WebkitMaskPosition: "center",
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden
        className="float-bob relative h-full w-full opacity-85 drop-shadow-lg"
        style={{ animationDelay: delay }}
      />
    </div>
  );
}

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      <LandingThemeFollow />
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
            them. Left-aligned with the CTA in the hero: a centerd hero is the
            default shape, and the asymmetry is what makes this section lead. */}
        <section className="relative overflow-hidden bg-gradient-to-b from-violet-600 to-violet-700">
          <div className="mx-auto flex w-full max-w-[650px] flex-col px-5 pb-24 pt-12 sm:px-6 sm:pb-32 sm:pt-16 lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-12 lg:pb-44 lg:pt-20">
            <div className="order-2 mt-14 text-center lg:order-1 lg:mt-0 lg:text-left">
              {/* The H1 names the category: the pun was the whole first screen
                  and a pun ranks for nothing. The line it replaced opens the
                  subhead instead, where it still lands first. */}
              {/* One size at every breakpoint, and 2.75rem is the size the copy
                  fits: the hero column is 515px wide at lg, so anything above
                  44px pushes the headline to a third line whose tail is a single
                  word. Measured at 1440/1024/834/390 — 44px breaks into two full
                  lines from tablet up, three even ones on a phone. */}
              <h1 className="text-balance text-[2.75rem] font-bold leading-[1.06] tracking-[-0.02em] text-white">
                Ghosted, a free,{" "}
                {/* Kept whole: a line break after "open-" read as a typo. */}
                <span className="whitespace-nowrap">open-source</span> job
                tracker
              </h1>
              <p className="mt-6 text-base leading-relaxed text-violet-100 sm:text-lg">
                Never let a job application go quiet on you. Every application,
                interview and ghosting on one timeline, and a section of its own
                for the ones that stopped answering.
              </p>
              {/* Phones get the standard shape: two full-width rows, primary
                  first, instead of a wrapped row of two different widths. */}
              <div className="mt-9 flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-6 sm:gap-y-3 lg:justify-start">
                <Button size="lg" className={CTA_CLASSES} asChild>
                  <Link href="/register">
                    Start tracking free
                    <ArrowRight className={CTA_ARROW} aria-hidden />
                  </Link>
                </Button>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-md py-1 text-sm font-medium text-violet-100 underline decoration-violet-300/50 underline-offset-4 transition-colors hover:text-white hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-violet-700 sm:w-auto"
                >
                  <GithubMark className="h-4 w-4" />
                  View source on GitHub
                </a>
              </div>
            </div>

            {/* The pile: two rows of cards with a clear band between them, so
                the mascots can sit on top (`z-20`, as asked) without covering a
                company name or a meta line. Row one is interviewing + applied
                with `confused` between them; row two is ghosted + offer, with the
                sad phone ghost beside the ghosted card and `finger-guns` beside
                the offer. Everything is absolutely placed inside a sized box so
                the composition holds at every breakpoint, and the outer rings are
                clipped by the section. The mascots are flat vectors on a
                transparent ground, which is why nothing here is tinted by the
                OS: illustrations rather than silhouettes, hence images. */}
            <div data-testid="hero-pile" className="relative order-1 mt-12 h-[28rem] lg:order-2 lg:mt-0 lg:h-[27rem]">
              <IconTornado className="left-1/2 top-[45%]" />

              {/* One column of four on a phone — same rotations, same drift,
                  tucked under each other and staggered left/right — and the
                  desktop arrangement of two roughly diagonal pairs. The pile sits
                  above the copy on a phone and beside it on a wide screen. */}
              <FloatingCard
                app={MOCK_APPS[0]}
                className="left-6 top-0 w-[15rem] -rotate-6 sm:left-0 sm:top-[8%] sm:w-[19rem]"
                delay="-1.2s"
              />
              <FloatingCard
                app={MOCK_APPS[1]}
                className="right-6 top-[20%] w-[15rem] rotate-6 sm:right-0 sm:top-[19%] sm:w-[19rem]"
                delay="-2.8s"
              />

              {/* row two — the one that went quiet, and the one that answered */}
              <FloatingCard
                app={MOCK_APPS[3]}
                className="left-6 top-[40%] w-[15rem] -rotate-3 sm:left-2 sm:top-[46%] sm:w-[19rem]"
                delay="-4.5s"
              />
              <FloatingCard
                app={MOCK_APPS[2]}
                className="right-6 top-[60%] w-[15rem] rotate-3 sm:right-2 sm:top-[57%] sm:w-[19rem]"
                delay="-6.1s"
              />

              {/* The mascots, painted over the cards (`z-20`). Each overlaps its
                  card by about a corner's worth — the horizontal overlap is kept
                  near 30px and pushed to an outer edge, so the company name, the
                  role and the meta line stay readable while the ghost still sits
                  on top of the pile. */}
              <FloatingGhost
                src={ART.confused}
                className="left-[45%] -top-16 z-20 h-[7.5rem] w-[7.5rem] rotate-3 sm:-top-8"
                delay="-2.1s"
              />
              <FloatingGhost
                src={ART.sad}
                className="-left-6 bottom-[25%] z-20 h-[7.5rem] w-[7.5rem] rotate-[-5deg] sm:-left-[3.25rem] sm:bottom-[6%]"
                delay="-3.4s"
              />
              <FloatingGhost
                src={ART.fingerGuns}
                className="right-0 bottom-0 z-20 h-[7.5rem] w-[7.5rem] rotate-6 sm:right-[-3rem] sm:bottom-12"
                delay="-5.6s"
              />
            </div>
          </div>
        </section>

        {/* The two views, as the app actually looks: one window with a draggable
            seam, so the visitor pulls it to whichever view they care about. The
            captures are real screenshots of the dashboard (donation banner
            hidden), taken at 1280 and sliced below the app bar. */}
        <section
          aria-label="The app"
          className="relative z-10 mx-auto w-full max-w-6xl px-5 pt-16 sm:px-6 sm:pt-24"
        >
          <LandingMock />
        </section>

        {/* Why it exists, directly under the app window: an answer engine quotes
            the first sentence of a section, so the first sentence is the answer
            and the story follows it. It sits after the mock rather than between
            the hero and it because the mock pulls itself up over the hero's
            bottom padding — that overlap is the composition, and a section in
            between would be swallowed by it. */}
        <section
          id="why-ghosted-exists"
          aria-label="Why Ghosted exists"
          className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 pt-16 sm:px-6 sm:pt-24"
        >
          {/* Same frame as the sections below it, not a narrower centred block:
              the reader should not have to re-find the left edge of the page. */}
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-14">
            <div>
              <h2 className="text-[2rem] font-bold leading-[1.15] tracking-[-0.02em] sm:text-[2.25rem]">
                Why Ghosted exists
              </h2>
              <div className="mt-6 max-w-2xl space-y-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
                <p className="text-foreground">
                  Every job tracker I tried was a spreadsheet, an inbox, or
                  somebody&apos;s subscription funnel.
                </p>
                <p>
                  A friend applied to more than 500 places before me and had
                  nothing encouraging to report. I started my own hunt in late
                  August 2026, logged the first real application on 3 September,
                  and it ghosted me too.
                </p>
                <p>
                  The ones that went silent were the ones I forgot first — no
                  rejection, no reply, nothing. So Ghosted gives them their own
                  section: a hunt that has stalled becomes something you can see
                  instead of something you slowly lose track of.
                </p>
              </div>
            </div>
            {/* `content` is the calm pose and the only one the page was not using;
                the hero already has the confused, sad and finger-gun ghosts. */}
            <div className="mx-auto w-40 sm:w-48 lg:mx-0 lg:w-full lg:justify-self-end">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ART.content}
                alt=""
                aria-hidden
                className="ghost-float w-full opacity-90 drop-shadow-xl"
              />
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
          <h2 className="mx-auto max-w-2xl text-balance text-center text-[2rem] font-bold leading-[1.15] tracking-[-0.02em] sm:text-[2.25rem] lg:mx-0 lg:text-left">
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
                    "flex flex-1 flex-col gap-6 p-6",
                    f.wide && "lg:p-8",
                  )}
                >
                  <div className="flex flex-col">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
                      <f.icon className="h-6 w-6" aria-hidden />
                    </span>
                    <h3
                      className={cn(
                        "mt-4 font-semibold tracking-[-0.02em]",
                        f.wide ? "text-xl sm:text-2xl" : "text-lg",
                      )}
                    >
                      {f.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {f.body}
                    </p>
                    {f.link && (
                      <a
                        href={f.link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 inline-flex w-fit items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
                      >
                        <GithubMark className="h-3.5 w-3.5" />
                        {f.link.label}
                      </a>
                    )}
                    {f.soon && (
                      <span className="mt-4 inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                        <GithubMark className="h-3.5 w-3.5" />
                        coming soon
                      </span>
                    )}
                  </div>
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
          className="relative border-y border-zinc-800 bg-zinc-950 text-zinc-50 dark:bg-zinc-900"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgb(255 255 255 / 0.08) 1px, transparent 0)",
              backgroundSize: "22px 22px",
            }}
          />
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-6 sm:py-28">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:items-start lg:gap-16">
              <div className="lg:sticky lg:top-24">
                <h2 className="text-center text-[2rem] font-bold leading-[1.15] tracking-[-0.02em] sm:text-[2.25rem] lg:text-left">
                  What we&apos;re not doing
                </h2>
                <p className="mx-auto mt-6 max-w-md text-center text-base leading-relaxed text-zinc-400 sm:text-lg lg:mx-0 lg:text-left">
                  Ghosted is a logbook for your job hunt — not an automation
                  software. A simple tool for simple needs.
                </p>
              </div>
              <ul className="mx-auto flex w-full max-w-[700px] flex-col gap-5 lg:mx-0 lg:max-w-none">
                {NOT_DOING.map(({ icon: Icon, title, body }) => (
                  <li
                    key={title}
                    className="flex items-start gap-5 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 transition-colors hover:border-zinc-700"
                  >
                    <span
                      aria-hidden
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800/80 text-zinc-300"
                    >
                      <Icon className="h-6 w-6" />
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold tracking-[-0.02em] text-zinc-50 sm:text-xl">
                        {title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                        {body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Comparison — the block answer engines pull for "X vs Y" queries. The
            middle column says "a typical paid tracker", and rows where the answer
            is not ours to state say "depends": a table that overstates a
            competitor is the same penalty risk as schema that overstates us. */}
        <section
          aria-label="Ghosted compared"
          className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6 sm:py-24"
        >
          <h2 className="mx-auto max-w-2xl text-center text-[2rem] font-bold leading-[1.15] tracking-[-0.02em] sm:text-[2.25rem] lg:mx-0 lg:text-left">
            Ghosted vs a paid tracker vs a spreadsheet
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-relaxed text-muted-foreground lg:mx-0 lg:text-left">
            What the free option actually gives you, next to the two things it
            replaces.
          </p>
          {/* Scrollable on a phone, so the strip needs a stop of its own — the
              same contract the board makes (axe: scrollable-region-focusable). */}
          <div
            role="region"
            aria-label="Comparison table"
            tabIndex={0}
            className="mt-10 overflow-x-auto rounded-xl border bg-card pb-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
              <caption className="sr-only">
                Ghosted compared with a typical paid job tracker and a spreadsheet
              </caption>
              <thead>
                <tr className="border-b bg-muted/40">
                  <th scope="col" className="w-[22%] px-5 py-3 font-semibold">
                    <span className="sr-only">Feature</span>
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Ghosted
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    A typical paid tracker
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    A spreadsheet
                  </th>
                </tr>
              </thead>
              <tbody className="[&_tr+tr]:border-t">
                {COMPARISON.map(({ row, ghosted, paid, sheet }) => (
                  <tr key={row}>
                    <th scope="row" className="px-5 py-4 align-top font-medium">
                      {row}
                    </th>
                    <td className="px-5 py-4 align-top text-muted-foreground">
                      {ghosted}
                    </td>
                    <td className="px-5 py-4 align-top text-muted-foreground">
                      {paid}
                    </td>
                    <td className="px-5 py-4 align-top text-muted-foreground">
                      {sheet}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Paid trackers differ; the middle column describes the common shape,
            not one product. Ghosted is{" "}
            <a
              href={LICENSE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={BODY_LINK}
            >
              MIT licensed
            </a>
            , so the source is yours to read, fork or self-host.
          </p>
        </section>

        {/* FAQ — the page has made its claims and its refusals; this is where
            the reader gets to check them. Same two-column rhythm as the band
            above (sticky heading, list on the right) so it reads as its
            continuation rather than a new pitch. */}
        <section
          id="faq"
          aria-label="Questions, answered"
          className="scroll-mt-20 bg-background"
        >
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-6 sm:py-28">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:items-start lg:gap-16">
              <div className="lg:sticky lg:top-24">
                <h2 className="text-center text-[2rem] font-bold leading-[1.15] tracking-[-0.02em] sm:text-[2.25rem] lg:text-left">
                  Questions, answered
                </h2>
                <p className="mx-auto mt-6 max-w-md text-center text-base leading-relaxed text-muted-foreground sm:text-lg lg:mx-0 lg:text-left">
                  The short answers to the ones I get asked most. The longer ones
                  live in the repo.
                </p>
              </div>
              <div className="mx-auto flex w-full max-w-[700px] flex-col gap-4 lg:mx-0 lg:max-w-none">
                {LANDING_FAQ.map(({ q, a, link }) => (
                  <details
                    key={q}
                    className="group rounded-xl border bg-card shadow transition-colors hover:border-violet-500/40 open:border-violet-500/40"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-xl px-6 py-5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                      <h3 className="text-base font-semibold tracking-[-0.02em] sm:text-lg">
                        {q}
                      </h3>
                      <ChevronDown
                        aria-hidden
                        className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                      />
                    </summary>
                    <p className="px-6 pb-6 pr-10 text-sm leading-relaxed text-muted-foreground">
                      <FaqAnswer entry={{ q, a, link }} />
                    </p>
                  </details>
                ))}
                <p className="mt-2 text-sm text-muted-foreground">
                  Something the answers miss? Write to{" "}
                  <a href="mailto:hey@nomorenames.studio" className={BODY_LINK}>
                    hey@nomorenames.studio
                  </a>
                  .
                </p>
              </div>
            </div>
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
              className="ghost-float mx-auto h-28 w-28 opacity-85 drop-shadow-lg sm:h-36 sm:w-36"
            />
            <h2 className="mt-6 text-[2rem] font-bold leading-[1.1] tracking-[-0.02em] text-white sm:text-[2.5rem]">
              Keep hunting, stop the haunting
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-violet-100 sm:text-lg">
              Few seconds to set up, free for as long as the hunt takes. Log
              the next application tonight.
            </p>
            <Button size="lg" className={cn(CTA_CLASSES, "mt-9")} asChild>
              <Link href="/register">
                Create your free account
                <ArrowRight className={CTA_ARROW} aria-hidden />
              </Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
