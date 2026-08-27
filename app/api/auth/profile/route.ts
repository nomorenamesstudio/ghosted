import { NextResponse } from "next/server";
import { issueEmailVerification, updateProfile } from "@/lib/services/account";
import { sendVerificationEmail } from "@/lib/emails";
import { updateProfileSchema } from "@/lib/utils/validation";
import { handleRouteError, jsonError, requireSessionForWrite } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  try {
    const userId = await requireSessionForWrite("profile");
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
    const { user, emailChanged } = await updateProfile(userId, parsed.data);

    // A changed email is unverified until confirmed — send a new link.
    if (emailChanged) {
      const { raw, email } = await issueEmailVerification(userId);
      await sendVerificationEmail(email, raw);
    }

    return NextResponse.json({
      data: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
