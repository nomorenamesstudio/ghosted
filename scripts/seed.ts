/**
 * Dev seed: creates a demo user (if missing) with a rich set of sample
 * applications covering every status. Re-running is additive — apps that
 * already exist (company + role) are skipped, so it is safe to re-run after
 * experimenting.
 *
 * Run with: pnpm db:seed
 */
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { applications, milestones, users } from "@/lib/db/schema";
import {
  createApplication,
  softDeleteApplication,
  updateApplication,
  updateMilestone,
} from "@/lib/services/applications";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "password123";

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
  /** Simulate an application untouched for 7+ days (lights up "Cold"). */
  staleDays?: number;
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
  },
  {
    company: "Vercel",
    role: "Backend Engineer",
    url: "https://vercel.example/careers/backend",
    contactName: "Tomás Rivera",
    contactEmail: "tomas@vercel.example",
    notes: "Offer received — negotiating start date.",
    doneSteps: 5,
  },
  {
    company: "Linear",
    role: "Product Designer",
    url: "https://linear.example/jobs/designer",
    notes: "Portfolio reviewed, waiting for a response.",
    doneSteps: 1,
  },
  {
    company: "Notion",
    role: "Data Analyst",
    url: "https://notion.example/careers/analyst",
    contactName: "Sofia Weber",
    contactPhone: "+49-30-555-0142",
    doneSteps: 3,
  },
  {
    company: "Figma",
    role: "Design Systems Engineer",
    url: "https://figma.example/jobs/design-systems",
    notes: "Offer! Referral bonus applies.",
    doneSteps: 5,
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
  },
  {
    company: "Supabase",
    role: "Full Stack Engineer",
    url: "https://supabase.example/jobs/fullstack",
    contactEmail: "hiring@supabase.example",
    doneSteps: 2,
    finalStatus: "rejected",
  },
  {
    company: "Framer",
    role: "Motion Designer",
    url: "https://framer.example/jobs/motion",
    doneSteps: 1,
    staleDays: 9,
  },
  {
    company: "Raycast",
    role: "macOS Engineer",
    url: "https://raycast.example/jobs/macos",
    contactName: "Daniel S.",
    contactPhone: "+44-20-555-0177",
    notes: "Take-home test completed, system design next.",
    doneSteps: 2,
  },
  {
    company: "Resend",
    role: "Growth Engineer",
    url: "https://resend.example/careers/growth",
    doneSteps: 1,
  },
  {
    company: "Loom",
    role: "Frontend Engineer",
    url: "https://loom.example/jobs/frontend",
    contactName: "Alex Kim",
    contactEmail: "alex@loom.example",
    notes: "All interviews done — offer extended.",
    doneSteps: 5,
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
  },
  {
    company: "Hooli",
    role: "QA Engineer",
    url: "https://hooli.example/jobs/qa",
    doneSteps: 2,
    finalStatus: "archived",
  },
];

async function main() {
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, DEMO_EMAIL))
    .limit(1);

  if (!user) {
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

    // Mark additional milestones done (step 0 is already done on create).
    if (sample.doneSteps > 1) {
      const ms = await db
        .select()
        .from(milestones)
        .where(eq(milestones.applicationId, app.id))
        .orderBy(milestones.stepOrder);
      for (let i = 1; i < Math.min(sample.doneSteps, ms.length); i++) {
        await updateMilestone(user.id, ms[i].id, { status: "done" });
      }
    }

    if (sample.finalStatus === "rejected") {
      await updateApplication(user.id, app.id, { status: "rejected" });
    } else if (sample.finalStatus === "archived") {
      await softDeleteApplication(user.id, app.id);
    }

    if (sample.staleDays) {
      const stale = new Date(
        Date.now() - sample.staleDays * 24 * 60 * 60 * 1000,
      );
      await db
        .update(applications)
        .set({ updatedAt: stale })
        .where(eq(applications.id, app.id));
    }

    created += 1;
    console.log(
      `seeded ${sample.company} (${sample.role}) · done=${sample.doneSteps} · ${
        sample.finalStatus ?? "derived"
      }${sample.staleDays ? ` · stale ${sample.staleDays}d` : ""}`,
    );
  }

  console.log(`\ndone — ${created} new sample application(s) for ${DEMO_EMAIL}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
