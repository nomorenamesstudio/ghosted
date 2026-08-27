import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { and, eq, isNotNull, lt, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { forgotPasswordSchema } from "@/lib/utils/validation";
import { sendPasswordResetEmail } from "@/lib/emails";
import {
  handleRouteError,
  jsonError,
  rateLimited,
} from "@/lib/utils/api";
import {
  getClientIp,
  rateLimit,
  rateLimitAccount,
} from "@/lib/utils/rate-limit";
import { logAuthEvent } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit(ip, "forgot-password");
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

    // Per-email throttle independent of the IP header: limits reset-email
    // flooding even under NAT or spoofed headers.
    const acct = rateLimitAccount(email, "forgot-password");
    if (!acct.ok) return rateLimited(acct.retryAfterSeconds);

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
        // Purge this user's stale reset tokens (used or expired) so the
        // table never grows unbounded, then issue a fresh one.
        const now = new Date();
        await db
          .delete(passwordResetTokens)
          .where(
            and(
              eq(passwordResetTokens.userId, user.id),
              or(
                isNotNull(passwordResetTokens.usedAt),
                lt(passwordResetTokens.expiresAt, now),
              ),
            ),
          );

        const rawToken = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
        await db.insert(passwordResetTokens).values({
          userId: user.id,
          tokenHash: hashToken(rawToken),
          expiresAt,
        });

        await sendPasswordResetEmail(email, rawToken);
        logAuthEvent("password_reset", { ip, email });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
