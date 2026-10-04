import { NextResponse } from "next/server";
import {
  getApplication,
  softDeleteApplication,
  updateApplication,
} from "@/lib/services/applications";
import { updateApplicationSchema } from "@/lib/utils/validation";
import { handleRouteError, jsonError, requireSession, requireSessionForWrite } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const userId = await requireSession();
    if (!UUID_RE.test(id)) {
      return jsonError(404, "Application not found", "NOT_FOUND");
    }
    const application = await getApplication(userId, id);
    if (!application) {
      return jsonError(404, "Application not found", "NOT_FOUND");
    }
    return NextResponse.json({ data: application });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const userId = await requireSessionForWrite("applications");
    if (!UUID_RE.test(id)) {
      return jsonError(404, "Application not found", "NOT_FOUND");
    }
    const body = await req.json().catch(() => null);
    const parsed = updateApplicationSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        400,
        "Invalid request payload",
        "VALIDATION_ERROR",
        parsed.error.flatten(),
      );
    }
    const application = await updateApplication(userId, id, parsed.data);
    if (!application) {
      return jsonError(404, "Application not found", "NOT_FOUND");
    }
    return NextResponse.json({ data: application });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Soft delete: marks the application as archived (row is preserved). */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const userId = await requireSessionForWrite("applications");
    if (!UUID_RE.test(id)) {
      return jsonError(404, "Application not found", "NOT_FOUND");
    }
    const application = await softDeleteApplication(userId, id);
    if (!application) {
      return jsonError(404, "Application not found", "NOT_FOUND");
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
