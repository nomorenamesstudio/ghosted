import { NextResponse } from "next/server";
import { AuthError } from "next-auth";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { BCRYPT_ROUNDS, signIn } from "@/lib/auth";
import { canDeliverMail, registrationOpen } from "@/lib/config/flags";
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
import {
  getClientIp,
  rateLimit,
  rateLimitAccount,
  rateLimitSuccess,
} from "@/lib/utils/rate-limit";
import { logAuthEvent } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // The flag is a promise about who can get in, and the form being hidden is
    // not enforcement: this route answers curl. A solo or private instance sets
    // ALLOW_REGISTRATION=false and means it.
    if (!registrationOpen()) {
      return jsonError(
        403,
        "This instance is not accepting new accounts.",
        "REGISTRATION_CLOSED",
      );
    }

    // And an instance that cannot send mail cannot complete a sign-up it would
    // only half-create: the account would exist and never be verifiable. This is
    // where that deployment rule earns its keep — not at build time (a build has
    // no deployment) and not at boot (a crash loop fixes nothing), but at the
    // moment a real person would be affected. The health probe reports the same
    // problem to the operator.
    if (process.env.NODE_ENV === "production" && !canDeliverMail()) {
      logAuthEvent("register", {
        ip: getClientIp(req),
        reason: "mail-not-deliverable",
      });
      return jsonError(
        503,
        "This instance cannot send verification email yet, so sign-ups are paused. The operator needs to configure an email transport.",
        "MAIL_NOT_CONFIGURED",
      );
    }

    const ip = getClientIp(req);
    const rl = rateLimit(ip, "register");
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

    // Header-independent per-account throttle: one sign-up per email window,
    // regardless of spoofed IP headers.
    const acct = rateLimitAccount(email, "register");
    if (!acct.ok) return rateLimited(acct.retryAfterSeconds);

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) {
      return jsonError(409, "An account with this email already exists", "EMAIL_TAKEN");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    let user;
    try {
      [user] = await db
        .insert(users)
        .values({ email, name, passwordHash, provider: "email" })
        .returning();
    } catch (err) {
      // Unique-violation race (two concurrent sign-ups for the same email):
      // the other request won, so this one is a 409, not a 500.
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: unknown }).code === "23505"
      ) {
        return jsonError(409, "An account with this email already exists", "EMAIL_TAKEN");
      }
      throw err;
    }

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

    // Success: reset the register window so a legit sign-up isn't blocked by
    // earlier failed attempts from the same IP/email.
    rateLimitSuccess(ip, "register");
    rateLimitSuccess(email, "acct:register");

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
