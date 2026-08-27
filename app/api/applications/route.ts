import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import {
  countApplications,
  createApplication,
  listApplications,
  UNVERIFIED_APP_LIMIT,
} from "@/lib/services/applications";
import { createApplicationSchema, listApplicationsQuerySchema } from "@/lib/utils/validation";
import { handleRouteError, jsonError, requireSession, requireSessionForWrite } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const userId = await requireSession();
    const url = new URL(req.url);
    const parsed = listApplicationsQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    if (!parsed.success) {
      return jsonError(
        400,
        "Invalid query parameters",
        "VALIDATION_ERROR",
        parsed.error.flatten(),
      );
    }
    const result = await listApplications(userId, parsed.data);
    return NextResponse.json({ data: result.data, pagination: result.pagination });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireSessionForWrite("applications");
    const body = await req.json().catch(() => null);
    const parsed = createApplicationSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        400,
        "Invalid request payload",
        "VALIDATION_ERROR",
        parsed.error.flatten(),
      );
    }

    // Unverified emails are limited to UNVERIFIED_APP_LIMIT applications
    // (including archived ones) — enough to try the product, but verify the
    // email to keep tracking without the cap.
    const [user] = await db
      .select({ emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user?.emailVerified) {
      const count = await countApplications(userId);
      if (count >= UNVERIFIED_APP_LIMIT) {
        return jsonError(
          403,
          "Verify your email to add more applications — unverified accounts are limited to 3.",
          "EMAIL_UNVERIFIED_LIMIT",
        );
      }
    }

    const application = await createApplication(userId, parsed.data);
    return NextResponse.json({ data: application }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
