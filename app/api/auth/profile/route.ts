import { NextResponse } from "next/server";
import { issueEmailVerification, updateProfile } from "@/lib/services/account";
import { sendEmailChangedEmail, sendVerificationEmail } from "@/lib/emails";
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
    const { user, emailChanged, previousEmail } = await updateProfile(
      userId,
      parsed.data,
    );

    // A changed email is unverified until confirmed — send a new link.
    if (emailChanged) {
      const { raw, email } = await issueEmailVerification(userId);
      await sendVerificationEmail(email, raw);
      // And tell the address that just stopped being the way in: it is the one
      // that no longer signs in, and the one an attacker moved the account away
      // from. Best-effort — the change has already happened.
      await sendEmailChangedEmail(previousEmail, user.email);
    }

    return NextResponse.json({
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        patienceLevel: user.patienceLevel,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
