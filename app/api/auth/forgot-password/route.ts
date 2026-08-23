import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { forgotPasswordSchema } from "@/lib/utils/validation";
import {
  handleRouteError,
  jsonError,
  rateLimited,
} from "@/lib/utils/api";
import { getClientIp, rateLimit } from "@/lib/utils/rate-limit";
import { logAuthEvent, logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit(ip);
    if (!rl.ok) return rateLimited(rl.retryAfterSeconds);

    const body = await req.json().catch(() => null);
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        400,
        "Invalid request payload",
        "VALIDATION_ERROR",
        parsed.error.flatten(),
      );
    }

    const { email } = parsed.data;
    const ttlMinutes = Number(process.env.PASSWORD_RESET_TTL_MINUTES ?? 60);

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // Always succeed (no account enumeration). Only create a token when the
    // user exists AND has a password (OAuth-only accounts can't reset).
    if (user) {
      const [row] = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      if (row?.passwordHash) {
        const rawToken = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
        await db.insert(passwordResetTokens).values({
          userId: user.id,
          tokenHash: hashToken(rawToken),
          expiresAt,
        });

        const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/reset-password?token=${rawToken}`;
        // MVP stub: no mail provider configured. In production this would be
        // sent via an email service; here it is logged (structured) instead.
        logger.info(
          { userId: user.id, email, ttlMinutes },
          `password reset link (dev stub): ${resetUrl}`,
        );
        logAuthEvent("password_reset", { ip, email });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
