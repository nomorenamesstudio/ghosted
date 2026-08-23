import { NextResponse } from "next/server";
import {
  createApplication,
  listApplications,
} from "@/lib/services/applications";
import { createApplicationSchema, listApplicationsQuerySchema } from "@/lib/utils/validation";
import { handleRouteError, jsonError, requireSession } from "@/lib/utils/api";

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
    const userId = await requireSession();
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
    const application = await createApplication(userId, parsed.data);
    return NextResponse.json({ data: application }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
