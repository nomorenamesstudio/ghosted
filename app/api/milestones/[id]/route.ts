import { NextResponse } from "next/server";
import {
  deleteMilestone,
  updateMilestone,
} from "@/lib/services/applications";
import { updateMilestoneSchema } from "@/lib/utils/validation";
import { handleRouteError, jsonError, requireSessionForWrite } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const userId = await requireSessionForWrite("milestones");
    if (!UUID_RE.test(id)) {
      return jsonError(404, "Milestone not found", "NOT_FOUND");
    }
    const body = await req.json().catch(() => null);
    const parsed = updateMilestoneSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        400,
        "Invalid request payload",
        "VALIDATION_ERROR",
        parsed.error.flatten(),
      );
    }
    const result = await updateMilestone(userId, id, parsed.data);
    if (!result) {
      return jsonError(404, "Milestone not found", "NOT_FOUND");
    }
    return NextResponse.json({ data: result });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const userId = await requireSessionForWrite("milestones");
    if (!UUID_RE.test(id)) {
      return jsonError(404, "Milestone not found", "NOT_FOUND");
    }
    const result = await deleteMilestone(userId, id);
    if (!result) {
      return jsonError(404, "Milestone not found", "NOT_FOUND");
    }
    return NextResponse.json({ data: result });
  } catch (err) {
    return handleRouteError(err);
  }
}
