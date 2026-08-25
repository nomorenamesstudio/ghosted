import { NextResponse } from "next/server";
import { verifyEmail } from "@/lib/services/account";
import { handleRouteError, jsonError } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

/** Confirm an email address with the token from the verification email. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? "";
    if (token.length < 20) {
      return jsonError(
        400,
        "This verification link is invalid or has expired",
        "INVALID_VERIFICATION_TOKEN",
      );
    }
    const result = await verifyEmail(token);
    if (!result) {
      return jsonError(
        400,
        "This verification link is invalid or has expired",
        "INVALID_VERIFICATION_TOKEN",
      );
    }
    return NextResponse.json({ ok: true, email: result.email });
  } catch (err) {
    return handleRouteError(err);
  }
}
