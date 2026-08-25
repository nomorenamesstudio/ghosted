import { eq, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";
import {
  applications,
  milestones,
  users,
  type Milestone,
} from "@/lib/db/schema";
import { ApiError } from "@/lib/utils/api";
import { BCRYPT_ROUNDS } from "@/lib/auth";

/** Update profile fields (name/email). Throws 409 EMAIL_TAKEN on duplicates. */
export async function updateProfile(
  userId: string,
  input: { name?: string; email?: string },
) {
  const values: { name?: string; email?: string } = {};
  if (input.name !== undefined) values.name = input.name;
  if (input.email !== undefined) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (existing && existing.id !== userId) {
      throw new ApiError(
        409,
        "An account with this email already exists",
        "EMAIL_TAKEN",
      );
    }
    values.email = input.email;
  }
  if (Object.keys(values).length === 0) {
    throw new ApiError(400, "Nothing to update", "VALIDATION_ERROR");
  }

  const [user] = await db
    .update(users)
    .set(values)
    .where(eq(users.id, userId))
    .returning();
  return user;
}

/** Verify the current password and set a new one. */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new ApiError(404, "User not found", "NOT_FOUND");
  if (!user.passwordHash) {
    throw new ApiError(
      400,
      "This account has no password (OAuth sign-in only)",
      "NO_PASSWORD",
    );
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    throw new ApiError(401, "Current password is incorrect", "INVALID_PASSWORD");
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

/** GDPR erasure: delete the account (cascades to applications, milestones, tokens). */
export async function deleteAccount(userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}

export interface UserExport {
  exportedAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    provider: string;
    createdAt: Date;
  };
  applications: Array<Record<string, unknown> & { milestones: Milestone[] }>;
}

/** GDPR portability (Art. 20): all of the user's data as structured JSON. */
export async function exportUserData(userId: string): Promise<UserExport | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;

  const apps = await db
    .select()
    .from(applications)
    .where(eq(applications.userId, userId));

  const milestonesById = new Map<string, Milestone[]>();
  if (apps.length > 0) {
    const rows = await db
      .select()
      .from(milestones)
      .where(
        inArray(
          milestones.applicationId,
          apps.map((a) => a.id),
        ),
      )
      .orderBy(milestones.stepOrder);
    for (const m of rows) {
      const list = milestonesById.get(m.applicationId) ?? [];
      list.push(m);
      milestonesById.set(m.applicationId, list);
    }
  }

  return {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      provider: user.provider,
      createdAt: user.createdAt,
    },
    applications: apps.map((app) => ({
      ...app,
      milestones: milestonesById.get(app.id) ?? [],
    })),
  };
}
