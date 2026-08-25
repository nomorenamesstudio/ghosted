import { NextResponse } from "next/server";
import { AuthError } from "next-auth";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { BCRYPT_ROUNDS, signIn } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { registerSchema } from "@/lib/utils/validation";
import { issueEmailVerification } from "@/lib/services/account";
import { sendVerificationEmail } from "@/lib/emails";
import {
  handleRouteError,
  jsonError,
  rateLimited,
} from "@/lib/utils/api";
import { getClientIp, rateLimit } from "@/lib/utils/rate-limit";
import { logAuthEvent } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit(ip);
    if (!rl.ok) return rateLimited(rl.retryAfterSeconds);

    const body = await req.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        400,
        "Invalid request payload",
        "VALIDATION_ERROR",
        parsed.error.flatten(),
      );
    }

    const { email, password, name } = parsed.data;

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) {
      return jsonError(409, "An account with this email already exists", "EMAIL_TAKEN");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const [user] = await db
      .insert(users)
      .values({ email, name, passwordHash, provider: "email" })
      .returning();

    logAuthEvent("register", { ip, email });

    // Email accounts start unverified — send the verification email.
    const { raw, email: verifyEmail } = await issueEmailVerification(user.id);
    await sendVerificationEmail(verifyEmail, raw);

    // Auto sign-in after successful registration.
    try {
      await signIn("credentials", {
        email: user.email,
        password,
        redirect: false,
      });
    } catch (error) {
      // Non-fatal: user can sign in on the login page.
      if (!(error instanceof AuthError)) throw error;
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
