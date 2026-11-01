import { NextResponse } from "next/server";
import { findApplicationCandidates } from "@/lib/services/applications";
import { applicationMatchQuerySchema } from "@/lib/utils/validation";
import {
  handleRouteError,
  jsonError,
  requireSession,
} from "@/lib/utils/api";

export const dynamic = "force-dynamic";

/**
 * "Is this already on the board?" — a read the add form makes before it writes.
 *
 * It never decides anything: the answer is a list plus a verdict, and the form
 * shows it and lets the user file a second row if that is what they meant. A
 * rejection or an archived copy makes `verdict` `closed`, because re-applying to
 * a job that already went that way is a real thing, not a mistake.
 */
export async function GET(req: Request) {
  try {
    const userId = await requireSession();
    const url = new URL(req.url);
    const parsed = applicationMatchQuerySchema.safeParse(
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
    return NextResponse.json({
      data: await findApplicationCandidates(userId, {
        company: parsed.data.company ?? "",
        role: parsed.data.role ?? "",
        url: parsed.data.url ?? null,
      }),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
