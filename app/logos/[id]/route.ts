import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { applications } from "@/lib/db/schema";
import { resolveCompanyLogo } from "@/lib/services/company-logos";
import { logger } from "@/lib/utils/logger";

/**
 * Company logo for one application, e.g. `/logos/<applicationId>?v=<updatedAt>`.
 *
 * Served from our own origin so the browser caches it: the `?v=` bump comes
 * from the application's `updatedAt`, so editing an application to a different
 * company swaps the logo, and an unchanged one is cached `immutable` forever.
 *
 * Deliberately NOT under `/api`: middleware.ts puts `no-store` on every
 * `/api/*` response to stop an authenticated JSON response being served to the
 * next user of the same browser. Logo bytes are not user data and must be
 * cacheable, and keeping them off the `/api` prefix leaves that guard intact.
 *
 * Unauthenticated requests get a plain 404 rather than a 401: the landing-page
 * product mock renders the same card component with fake application ids, and
 * a logged-out visitor should simply see the monogram.
 */

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(): NextResponse {
  return new NextResponse(null, {
    status: 404,
    headers: { "cache-control": "private, max-age=3600" },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    if (!UUID_RE.test(params.id)) return notFound();

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return notFound();

    const [application] = await db
      .select({
        company: applications.company,
        url: applications.url,
        companyWebsite: applications.companyWebsite,
      })
      .from(applications)
      .where(
        and(eq(applications.id, params.id), eq(applications.userId, userId)),
      )
      .limit(1);
    if (!application) return notFound();

    const logo = await resolveCompanyLogo(
      application.company,
      application.url,
      application.companyWebsite,
    );
    if (!logo) return notFound();

    return new NextResponse(new Uint8Array(logo.bytes), {
      status: 200,
      headers: {
        "content-type": logo.contentType,
        "content-length": String(logo.bytes.length),
        // Versioned by `?v=` in the URL, so this can never go stale.
        "cache-control": "private, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    // A logo is decoration: never turn a lookup failure into a broken page.
    logger.warn({ err, applicationId: params.id }, "company logo lookup failed");
    return notFound();
  }
}
