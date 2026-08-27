import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { BCRYPT_ROUNDS } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { resetPasswordSchema } from "@/lib/utils/validation";
import {
  handleRouteError,
  jsonError,
  rateLimited,
} from "@/lib/utils/api";
import { getClientIp, rateLimit, rateLimitSuccess } from "@/lib/utils/rate-limit";
import { logAuthEvent } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit(ip, "reset-password");
    if (!rl.ok) return rateLimited(rl.retryAfterSeconds);

    const body = await req.json().catch(() => null);
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        400,
        "Invalid request payload",
        "VALIDATION_ERROR",
        parsed.error.flatten(),
      );
    }

    const { token, password } = parsed.data;

    const [resetRow] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, hashToken(token)),
          isNull(passwordResetTokens.usedAt),
        ),
      )
      .limit(1);

    if (!resetRow || resetRow.expiresAt.getTime() <= Date.now()) {
      return jsonError(
        400,
        "This reset link is invalid or has expired",
        "INVALID_RESET_TOKEN",
      );
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, resetRow.userId));

    // Invalidate this and any other outstanding tokens for the user.
    const now = new Date();
    await db
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokens.userId, resetRow.userId),
          isNull(passwordResetTokens.usedAt),
        ),
      );

    logAuthEvent("password_reset", {
      ip,
      email: undefined,
      reason: "completed",
    });
    rateLimitSuccess(ip, "reset-password");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
