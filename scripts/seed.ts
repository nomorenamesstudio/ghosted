/**
 * Dev seed: creates a demo user with a few applications so the dashboard is
 * not empty. Run with: pnpm db:seed
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { applications, users } from "@/lib/db/schema";
import { createApplication } from "@/lib/services/applications";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "password123";

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
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.userId, user.id));

  if (existing.length === 0) {
    const samples = [
      { company: "Acme Corp", role: "Senior Frontend Engineer", url: "https://acme.example/careers" },
      { company: "Globex", role: "Product Designer", url: null },
      { company: "Initech", role: "Backend Engineer", url: "https://initech.example/jobs/42" },
    ];
    for (const s of samples) {
      await createApplication(user.id, s);
    }
    console.log(`seeded ${samples.length} sample applications`);
  } else {
    console.log("demo user already has applications — nothing to seed");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
