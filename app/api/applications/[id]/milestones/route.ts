import { NextResponse } from "next/server";
import { addMilestone } from "@/lib/services/applications";
import { createMilestoneSchema } from "@/lib/utils/validation";
import { handleRouteError, jsonError, requireSession } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const userId = await requireSession();
    if (!UUID_RE.test(params.id)) {
      return jsonError(404, "Application not found", "NOT_FOUND");
    }
    const body = await req.json().catch(() => null);
    const parsed = createMilestoneSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        400,
        "Invalid request payload",
        "VALIDATION_ERROR",
        parsed.error.flatten(),
      );
    }
    const result = await addMilestone(userId, params.id, parsed.data);
    if (!result) {
      return jsonError(404, "Application not found", "NOT_FOUND");
    }
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
