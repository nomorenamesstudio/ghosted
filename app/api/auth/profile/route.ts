import { NextResponse } from "next/server";
import { updateProfile } from "@/lib/services/account";
import { updateProfileSchema } from "@/lib/utils/validation";
import { handleRouteError, jsonError, requireSession } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  try {
    const userId = await requireSession();
    const body = await req.json().catch(() => null);
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        400,
        "Invalid request payload",
        "VALIDATION_ERROR",
        parsed.error.flatten(),
      );
    }
    const user = await updateProfile(userId, parsed.data);
    return NextResponse.json({
      data: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
