import { NextResponse } from "next/server";
import { listBoard } from "@/lib/services/applications";
import { boardQuerySchema } from "@/lib/utils/validation";
import { handleRouteError, jsonError, requireSession } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

/**
 * The whole board in one request: every section's first page plus its total.
 *
 * Fetching it used to take six requests — one per column — each with its own
 * `count(*)` and its own page query, all of them really one partition of the
 * same rows. `load more` inside a section still goes through
 * `GET /api/applications`, which returns a section in exactly the same shape, so
 * the two are interchangeable and a section can be paged without knowing which
 * one filled it.
 */
export async function GET(req: Request) {
  try {
    const userId = await requireSession();
    const url = new URL(req.url);
    const parsed = boardQuerySchema.safeParse(
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

    const sections = await listBoard(userId, parsed.data);
    return NextResponse.json({ sections });
  } catch (err) {
    return handleRouteError(err);
  }
}
