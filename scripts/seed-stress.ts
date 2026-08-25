/**
 * Dev-only stress seed: fills the demo user with a few hundred clearly-marked
 * "Stress Co" applications so the infinite-scroll + sticky-header behavior
 * can be experienced. Run with: pnpm db:seed:stress
 *
 * Cleanup: DELETE FROM applications WHERE company LIKE 'Stress Co %';
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { applications, milestones, users } from "@/lib/db/schema";
import {
  createApplication,
  updateApplication,
  updateMilestone,
} from "@/lib/services/applications";

const DEMO_EMAIL = "demo@example.com";
const COUNT = Number(process.env.STRESS_COUNT ?? 300);

async function main() {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, DEMO_EMAIL))
    .limit(1);
  if (!user) {
    console.error(`demo user not found — run pnpm db:seed first`);
    process.exit(1);
  }

  let created = 0;
  for (let i = 1; i <= COUNT; i++) {
    const n = String(i).padStart(3, "0");
    const bucket = i % 10; // roughly: 60% applied, 20% interviewing, 10% offer, 10% rejected

    const app = await createApplication(user.id, {
      company: `Stress Co ${n}`,
      role: `Engineer ${n}`,
      notes: "Stress-test filler data.",
    });
    const ms = await db
      .select()
      .from(milestones)
      .where(eq(milestones.applicationId, app.id))
      .orderBy(milestones.stepOrder);

    if (bucket >= 9) {
      // Offer: complete every step.
      for (const m of ms) await updateMilestone(user.id, m.id, { status: "done" });
    } else if (bucket >= 7) {
      // Interviewing: a couple of steps done.
      await updateMilestone(user.id, ms[1].id, { status: "done" });
      await updateMilestone(user.id, ms[2].id, { status: "done" });
    } else if (bucket === 6) {
      // Rejected (manual terminal status).
      await updateMilestone(user.id, ms[1].id, { status: "done" });
      await updateApplication(user.id, app.id, { status: "rejected" });
    }
    // else: applied (first step done by default).

    created += 1;
    if (i % 50 === 0) console.log(`…${i}`);
  }

  console.log(`seeded ${created} stress applications for ${DEMO_EMAIL}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
