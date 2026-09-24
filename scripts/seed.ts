/**
 * Dev seed: fills an account with a rich set of sample applications covering
 * every status. With no argument it targets (and creates, if missing) the demo
 * user; pass an email to fill an account that already exists — including a real
 * dev login, which is how you get a personal testing profile:
 *
 *   pnpm db:seed
 *   pnpm db:seed you@example.com
 *
 * Re-running is additive — apps that already exist (company + role) are skipped,
 * so it is safe to re-run after experimenting.
 */
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { applications, milestones, users } from "@/lib/db/schema";
import {
  createApplication,
  softDeleteApplication,
  toggleFavorite,
  updateApplication,
  updateMilestone,
} from "@/lib/services/applications";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "password123";

/** Who to fill: the first argument, then SEED_EMAIL, then the demo account. */
const targetEmail = (
  process.argv[2] ??
  process.env.SEED_EMAIL ??
  DEMO_EMAIL
).toLowerCase();

interface Sample {
  company: string;
  role: string;
  url?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  /** Total number of done milestones (createApplication marks step 0 done). */
  doneSteps: number;
  /** Manual status override after milestones (rejected / archived). */
  finalStatus?: "rejected" | "archived";
  /** Starred: pinned to the top of its section, starred on the card. */
  favorite?: boolean;
  /**
   * Days since the last touch. Drives the card's "Updated …" line, and once it
   * passes the account's patience level (10 days by default) the application
   * shows up as ghosted instead of active.
   */
  touchedDaysAgo?: number;
  /**
   * Renames the round the card shows as "Last round". The long ones exist to
   * push a list card's date onto a second line.
   */
  lastRoundTitle?: string;
}

const SAMPLES: Sample[] = [
  {
    company: "Stripe",
    role: "Senior Frontend Engineer",
    url: "https://stripe.example/jobs/senior-frontend",
    contactName: "Maya Chen",
    contactEmail: "maya.chen@stripe.example",
    contactPhone: "+1-415-555-0110",
    notes: "Had a great recruiter call; team uses React + TypeScript.",
    doneSteps: 3,
    favorite: true,
    touchedDaysAgo: 2,
  },
  {
    company: "Vercel",
    role: "Backend Engineer",
    url: "https://vercel.example/careers/backend",
    contactName: "Tomás Rivera",
    contactEmail: "tomas@vercel.example",
    notes: "Offer received — negotiating start date.",
    doneSteps: 5,
    touchedDaysAgo: 1,
  },
  {
    company: "Linear",
    role: "Product Designer",
    url: "https://linear.example/jobs/designer",
    notes: "Portfolio reviewed, waiting for a response.",
    doneSteps: 1,
    touchedDaysAgo: 6,
  },
  {
    company: "Notion",
    role: "Data Analyst",
    url: "https://notion.example/careers/analyst",
    contactName: "Sofia Weber",
    contactPhone: "+49-30-555-0142",
    doneSteps: 3,
    touchedDaysAgo: 4,
  },
  {
    company: "Figma",
    role: "Design Systems Engineer",
    url: "https://figma.example/jobs/design-systems",
    notes: "Offer! Referral bonus applies.",
    doneSteps: 5,
    favorite: true,
    touchedDaysAgo: 2,
  },
  {
    company: "GitHub",
    role: "Developer Advocate",
    url: "https://github.example/careers/devrel",
    contactName: "Priya Nair",
    contactEmail: "priya@github.example",
    notes: "Went well but they moved on with another candidate.",
    doneSteps: 3,
    finalStatus: "rejected",
    touchedDaysAgo: 21,
  },
  {
    company: "Supabase",
    role: "Full Stack Engineer",
    url: "https://supabase.example/jobs/fullstack",
    contactEmail: "hiring@supabase.example",
    doneSteps: 2,
    finalStatus: "rejected",
    touchedDaysAgo: 33,
  },
  {
    company: "Framer",
    role: "Motion Designer",
    url: "https://framer.example/jobs/motion",
    doneSteps: 1,
    touchedDaysAgo: 15,
  },
  {
    company: "Raycast",
    role: "macOS Engineer",
    url: "https://raycast.example/jobs/macos",
    contactName: "Daniel S.",
    contactPhone: "+44-20-555-0177",
    notes: "Take-home test completed, system design next.",
    doneSteps: 2,
    touchedDaysAgo: 3,
  },
  {
    company: "Resend",
    role: "Growth Engineer",
    url: "https://resend.example/careers/growth",
    doneSteps: 1,
    touchedDaysAgo: 8,
  },
  {
    company: "Loom",
    role: "Frontend Engineer",
    url: "https://loom.example/jobs/frontend",
    contactName: "Alex Kim",
    contactEmail: "alex@loom.example",
    notes: "All interviews done — offer extended.",
    doneSteps: 5,
    touchedDaysAgo: 1,
  },
  {
    company: "The Browser Company",
    role: "Product Engineer",
    url: "https://browserco.example/jobs/product",
    contactName: "Nora Fischer",
    contactEmail: "nora@browserco.example",
    contactPhone: "+1-646-555-0188",
    notes: "Awaiting panel interview slots.",
    doneSteps: 3,
    touchedDaysAgo: 5,
  },
  {
    company: "Hooli",
    role: "QA Engineer",
    url: "https://hooli.example/jobs/qa",
    doneSteps: 2,
    finalStatus: "archived",
    touchedDaysAgo: 48,
  },
  /* The rest fill out a personal dev account: every status has several cards,
     the ages span "just now" to "two months", and one round name is long enough
     to wrap a list card's date onto its second line. */
  {
    company: "Height",
    role: "Product Engineer",
    url: "https://height.example/jobs/product-engineer",
    contactName: "Ines Bartók",
    contactEmail: "ines@height.example",
    notes: "Pairing session went well; they want a systems round.",
    doneSteps: 4,
    favorite: true,
    touchedDaysAgo: 1,
  },
  {
    company: "Cal.com",
    role: "Frontend Engineer",
    url: "https://cal.example/jobs/frontend",
    doneSteps: 1,
    favorite: true,
    touchedDaysAgo: 3,
  },
  {
    company: "Perplexity",
    role: "Design Engineer",
    url: "https://perplexity.example/careers/design-engineer",
    notes: "Verbal offer — waiting on the written one.",
    doneSteps: 5,
    touchedDaysAgo: 2,
  },
  {
    company: "Sentry",
    role: "Staff Engineer",
    url: "https://sentry.example/jobs/staff",
    contactName: "Aditi Rao",
    contactEmail: "aditi@sentry.example",
    doneSteps: 3,
    touchedDaysAgo: 45,
  },
  {
    company: "PostHog",
    role: "Product Manager",
    url: "https://posthog.example/careers/pm",
    doneSteps: 2,
    touchedDaysAgo: 30,
  },
  {
    company: "Cursor",
    role: "Software Engineer",
    url: "https://cursor.example/jobs/swe",
    doneSteps: 1,
    touchedDaysAgo: 28,
  },
  {
    company: "Warp",
    role: "Frontend Engineer",
    url: "https://warp.example/jobs/frontend",
    contactName: "Jonas Lindqvist",
    contactEmail: "jonas@warp.example",
    notes: "Third round booked, then silence.",
    doneSteps: 3,
    lastRoundTitle: "Additional technical interview with the platform team",
    touchedDaysAgo: 60,
  },
  {
    company: "Zapier",
    role: "Full Stack Engineer",
    url: "https://zapier.example/jobs/fullstack",
    doneSteps: 4,
    finalStatus: "rejected",
    touchedDaysAgo: 26,
  },
  {
    company: "Miro",
    role: "UX Engineer",
    url: "https://miro.example/jobs/ux-engineer",
    doneSteps: 1,
    finalStatus: "rejected",
    touchedDaysAgo: 12,
  },
  {
    company: "Intercom",
    role: "Support Engineer",
    url: "https://intercom.example/jobs/support",
    contactName: "Grace Oyelaran",
    contactEmail: "grace@intercom.example",
    doneSteps: 2,
    touchedDaysAgo: 4,
  },
  {
    company: "Duffel",
    role: "Backend Engineer",
    url: "https://duffel.example/jobs/backend",
    notes: "Take-home submitted; review call next week.",
    doneSteps: 4,
    favorite: true,
    touchedDaysAgo: 2,
  },
  {
    company: "Retool",
    role: "Solutions Engineer",
    url: "https://retool.example/jobs/solutions",
    doneSteps: 3,
    finalStatus: "archived",
    touchedDaysAgo: 55,
  },
  {
    company: "Fly.io",
    role: "Platform Engineer",
    url: "https://fly.example/jobs/platform",
    contactName: "Marcus Webb",
    doneSteps: 1,
    touchedDaysAgo: 20,
  },
];

async function main() {
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, targetEmail))
    .limit(1);

  if (!user && targetEmail === DEMO_EMAIL) {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    [user] = await db
      .insert(users)
      .values({
        email: DEMO_EMAIL,
        name: "Demo User",
        passwordHash,
        provider: "email",
      })
      .returning();
    console.log(`created demo user ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  }

  if (!user) {
    // Only the demo account is ever created here: seeding a real login means
    // filling an account that already exists, never inventing one.
    console.error(
      `no account for ${targetEmail} — sign up (or log in) first, then re-run`,
    );
    process.exit(1);
  }

  const existing = await db
    .select({ company: applications.company, role: applications.role })
    .from(applications)
    .where(eq(applications.userId, user.id));
  const existingKeys = new Set(
    existing.map((a) => `${a.company.toLowerCase()}|${a.role.toLowerCase()}`),
  );

  let created = 0;
  for (const sample of SAMPLES) {
    const key = `${sample.company.toLowerCase()}|${sample.role.toLowerCase()}`;
    if (existingKeys.has(key)) {
      console.log(`skip ${sample.company} — already present`);
      continue;
    }

    const app = await createApplication(user.id, {
      company: sample.company,
      role: sample.role,
      url: sample.url ?? null,
      contactName: sample.contactName ?? null,
      contactEmail: sample.contactEmail ?? null,
      contactPhone: sample.contactPhone ?? null,
      notes: sample.notes ?? null,
    });

    // Mark additional milestones done (step 0 is already done on create), then
    // optionally rename the last one — that title is the card's "Last round".
    if (sample.doneSteps > 1 || sample.lastRoundTitle) {
      const ms = await db
        .select()
        .from(milestones)
        .where(eq(milestones.applicationId, app.id))
        .orderBy(milestones.stepOrder);
      const done = Math.min(sample.doneSteps, ms.length);
      for (let i = 1; i < done; i++) {
        await updateMilestone(user.id, ms[i].id, { status: "done" });
      }
      if (sample.lastRoundTitle) {
        await updateMilestone(user.id, ms[done - 1].id, {
          title: sample.lastRoundTitle,
        });
      }
    }

    if (sample.favorite) {
      await toggleFavorite(user.id, app.id);
    }

    if (sample.finalStatus === "rejected") {
      await updateApplication(user.id, app.id, { status: "rejected" });
    } else if (sample.finalStatus === "archived") {
      await softDeleteApplication(user.id, app.id);
    }

    // Backdated last: every write above stamps updated_at with "now", and this
    // is the clock both the "Updated …" line and the ghosted overlay read.
    if (sample.touchedDaysAgo) {
      const lastTouch = new Date(
        Date.now() - sample.touchedDaysAgo * 24 * 60 * 60 * 1000,
      );
      await db
        .update(applications)
        .set({ updatedAt: lastTouch })
        .where(eq(applications.id, app.id));
    }

    created += 1;
    console.log(
      `seeded ${sample.company} (${sample.role}) · done=${sample.doneSteps} · ${
        sample.finalStatus ?? "derived"
      }${sample.favorite ? " · starred" : ""}${
        sample.touchedDaysAgo ? ` · last touched ${sample.touchedDaysAgo}d ago` : ""
      }`,
    );
  }

  console.log(
    `\ndone — ${created} new sample application(s) for ${targetEmail}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
