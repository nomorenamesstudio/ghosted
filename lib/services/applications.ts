import { and, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import {
  applications,
  milestones,
  type Application,
  type Milestone,
} from "@/lib/db/schema";
import { calcProgress } from "@/lib/utils/progress";
import {
  computeDeleteShift,
  computeInsertShift,
  defaultMilestones,
  sortByStepOrder,
  totalStepsAfterDelete,
  totalStepsAfterInsert,
} from "@/lib/utils/reorder";
import { sanitizeText } from "@/lib/utils/sanitize";
import { ApiError } from "@/lib/utils/api";
import {
  deriveStatus,
  displayStatusOf,
  GHOSTED_AFTER_DAYS,
  type DisplayStatus,
} from "@/lib/utils/status";
import type {
  CreateApplicationInput,
  CreateMilestoneInput,
  UpdateApplicationInput,
  UpdateMilestoneInput,
} from "@/lib/utils/validation";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export interface ApplicationSummary {
  id: string;
  status: Application["status"];
  totalSteps: number;
  progress: number;
  milestoneCount: number;
}

export interface ApplicationDetail extends Application {
  milestones: Milestone[];
  progress: number;
  /** Effective status — "ghosted" when the app is stale (time-derived). */
  displayStatus: DisplayStatus;
}

export interface ApplicationListItem extends Application {
  progress: number;
  currentRound: string | null;
  milestoneCount: number;
  /** Effective status — "ghosted" when the app is stale (time-derived). */
  displayStatus: DisplayStatus;
}

export interface ListResult {
  data: ApplicationListItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface ListFilters {
  status?: DisplayStatus;
  search?: string;
  sort?: "company" | "status" | "updated_at";
  page: number;
  limit: number;
}

function summary(
  app: Pick<Application, "id" | "status" | "totalSteps">,
  ms: Milestone[],
): ApplicationSummary {
  return {
    id: app.id,
    status: app.status,
    totalSteps: app.totalSteps,
    progress: calcProgress({
      status: app.status,
      milestones: ms,
      totalSteps: app.totalSteps,
    }),
    milestoneCount: ms.length,
  };
}

function currentRound(ms: Milestone[]): string | null {
  const done = ms.filter((m) => m.status === "done");
  if (done.length > 0) {
    return [...done].sort((a, b) => b.stepOrder - a.stepOrder)[0].title;
  }
  return ms[0]?.title ?? null;
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/* ------------------------------------------------------------------ */
/* Applications                                                         */
/* ------------------------------------------------------------------ */

export async function listApplications(
  userId: string,
  filters: ListFilters,
): Promise<ListResult> {
  const { status, search, sort, page, limit } = filters;

  const cutoff = Date.now() - GHOSTED_AFTER_DAYS * 24 * 60 * 60 * 1000;

  const conditions = [eq(applications.userId, userId)];
  if (status === "ghosted") {
    // Stale applied|interviewing apps.
    conditions.push(
      inArray(applications.status, ["applied", "interviewing"]),
      sql`${applications.updatedAt} < ${new Date(cutoff).toISOString()}`,
    );
  } else if (status === "applied" || status === "interviewing") {
    // Recent apps of this status (stale ones are shown as ghosted).
    conditions.push(eq(applications.status, status));
    conditions.push(
      sql`${applications.updatedAt} >= ${new Date(cutoff).toISOString()}`,
    );
  } else if (status) {
    conditions.push(eq(applications.status, status));
  } else {
    // Archived ("soft-deleted") applications are hidden by default.
    conditions.push(ne(applications.status, "archived"));
  }
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push(
      or(
        ilike(applications.company, pattern),
        ilike(applications.role, pattern),
      )!,
    );
  }
  const where = and(...conditions);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(applications)
    .where(where);

  let orderBy: SQL[];
  switch (sort ?? "updated_at") {
    case "company":
      orderBy = [
        sql`${applications.isFavorite} desc`,
        sql`lower(${applications.company}) asc`,
        sql`${applications.updatedAt} desc`,
      ];
      break;
    case "status":
      orderBy = [
        sql`${applications.isFavorite} desc`,
        sql`case ${applications.status} when 'applied' then 1 when 'interviewing' then 2 when 'offer' then 3 when 'rejected' then 4 when 'archived' then 5 end asc`,
        sql`${applications.updatedAt} desc`,
      ];
      break;
    default:
      orderBy = [
        sql`${applications.isFavorite} desc`,
        sql`${applications.updatedAt} desc`,
        sql`${applications.createdAt} desc`,
      ];
  }

  const apps = await db
    .select()
    .from(applications)
    .where(where)
    .orderBy(...orderBy)
    .limit(limit)
    .offset((page - 1) * limit);

  const data: ApplicationListItem[] = [];
  if (apps.length > 0) {
    const msRows = await db
      .select()
      .from(milestones)
      .where(inArray(milestones.applicationId, apps.map((a) => a.id)))
      .orderBy(milestones.stepOrder);

    const byApp = new Map<string, Milestone[]>();
    for (const m of msRows) {
      const list = byApp.get(m.applicationId) ?? [];
      list.push(m);
      byApp.set(m.applicationId, list);
    }

    for (const app of apps) {
      const ms = byApp.get(app.id) ?? [];
      data.push({
        ...app,
        progress: calcProgress({
          status: app.status,
          milestones: ms,
          totalSteps: app.totalSteps,
        }),
        currentRound: currentRound(ms),
        milestoneCount: ms.length,
        displayStatus: displayStatusOf(app.status, app.updatedAt),
      });
    }
  }

  return {
    data,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.max(1, Math.ceil(count / limit)),
    },
  };
}

export async function getApplication(
  userId: string,
  applicationId: string,
): Promise<ApplicationDetail | null> {
  const [app] = await db
    .select()
    .from(applications)
    .where(
      and(eq(applications.id, applicationId), eq(applications.userId, userId)),
    )
    .limit(1);
  if (!app) return null;

  const ms = sortByStepOrder(
    await db
      .select()
      .from(milestones)
      .where(eq(milestones.applicationId, app.id)),
  );

  return {
    ...app,
    milestones: ms,
    progress: calcProgress({
      status: app.status,
      milestones: ms,
      totalSteps: app.totalSteps,
    }),
    displayStatus: displayStatusOf(app.status, app.updatedAt),
  };
}

export async function createApplication(
  userId: string,
  input: CreateApplicationInput,
): Promise<ApplicationDetail> {
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return db.transaction(async (tx) => {
    const titles = defaultMilestones("00000000-0000-4000-8000-000000000000").map(
      (m) => m.title,
    );
    const [app] = await tx
      .insert(applications)
      .values({
        userId,
        company: sanitizeText(input.company) ?? input.company,
        role: sanitizeText(input.role) ?? input.role,
        url: input.url || null,
        contactName: sanitizeText(input.contactName),
        contactEmail: sanitizeText(input.contactEmail),
        contactPhone: sanitizeText(input.contactPhone),
        notes: sanitizeText(input.notes),
        status: "applied",
        totalSteps: titles.length,
        updatedAt: now,
      })
      .returning();

    const defaults = defaultMilestones(app.id).map((m, i) => ({
      ...m,
      status: i === 0 ? ("done" as const) : ("pending" as const),
      date: i === 0 ? today : null,
    }));
    const ms = await tx.insert(milestones).values(defaults).returning();

    return {
      ...app,
      milestones: sortByStepOrder(ms),
      progress: calcProgress({
        status: app.status,
        milestones: ms,
        totalSteps: app.totalSteps,
      }),
      displayStatus: displayStatusOf(app.status, app.updatedAt),
    };
  });
}

export async function updateApplication(
  userId: string,
  applicationId: string,
  input: UpdateApplicationInput,
): Promise<Application | null> {
  const values: Partial<Application> = { updatedAt: new Date() };
  if (input.company !== undefined)
    values.company = sanitizeText(input.company) ?? input.company;
  if (input.role !== undefined)
    values.role = sanitizeText(input.role) ?? input.role;
  if (input.url !== undefined) values.url = input.url || null;
  if (input.contactName !== undefined)
    values.contactName = sanitizeText(input.contactName);
  if (input.contactEmail !== undefined)
    values.contactEmail = sanitizeText(input.contactEmail);
  if (input.contactPhone !== undefined)
    values.contactPhone = sanitizeText(input.contactPhone);
  if (input.notes !== undefined) values.notes = sanitizeText(input.notes);
  if (input.status !== undefined) values.status = input.status;

  const [updated] = await db
    .update(applications)
    .set(values)
    .where(
      and(eq(applications.id, applicationId), eq(applications.userId, userId)),
    )
    .returning();
  return updated ?? null;
}

/** Soft delete: archive the application, remembering its previous status. */
export async function softDeleteApplication(
  userId: string,
  applicationId: string,
): Promise<Application | null> {
  const [existing] = await db
    .select({ status: applications.status })
    .from(applications)
    .where(
      and(eq(applications.id, applicationId), eq(applications.userId, userId)),
    )
    .limit(1);
  if (!existing) return null;

  const [updated] = await db
    .update(applications)
    .set({
      status: "archived",
      archivedFromStatus: existing.status,
      updatedAt: new Date(),
    })
    .where(
      and(eq(applications.id, applicationId), eq(applications.userId, userId)),
    )
    .returning();
  return updated ?? null;
}

/**
 * Reopen: restore an archived application to the exact status it had before
 * archiving (falls back to 'applied' when unknown).
 */
export async function reopenApplication(
  userId: string,
  applicationId: string,
): Promise<Application | null> {
  const [existing] = await db
    .select()
    .from(applications)
    .where(
      and(eq(applications.id, applicationId), eq(applications.userId, userId)),
    )
    .limit(1);
  if (!existing) return null;
  if (existing.status !== "archived") {
    throw new ApiError(400, "Application is not archived", "NOT_ARCHIVED");
  }

  const [updated] = await db
    .update(applications)
    .set({
      status: existing.archivedFromStatus ?? "applied",
      archivedFromStatus: null,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId))
    .returning();
  return updated ?? null;
}

/** Toggle the favourite flag (favourites are pinned to the top of lists). */
export async function toggleFavorite(
  userId: string,
  applicationId: string,
): Promise<Application | null> {
  const [existing] = await db
    .select({ isFavorite: applications.isFavorite })
    .from(applications)
    .where(
      and(eq(applications.id, applicationId), eq(applications.userId, userId)),
    )
    .limit(1);
  if (!existing) return null;

  const [updated] = await db
    .update(applications)
    .set({ isFavorite: !existing.isFavorite })
    .where(eq(applications.id, applicationId))
    .returning();
  return updated ?? null;
}

/* ------------------------------------------------------------------ */
/* Milestones                                                           */
/* ------------------------------------------------------------------ */

type Tx = PostgresJsDatabase<typeof schema>;

async function findOwnedApplication(tx: Tx, userId: string, applicationId: string) {
  const [app] = await tx
    .select()
    .from(applications)
    .where(
      and(eq(applications.id, applicationId), eq(applications.userId, userId)),
    )
    .limit(1);
  return app ?? null;
}

export async function addMilestone(
  userId: string,
  applicationId: string,
  input: CreateMilestoneInput,
): Promise<{ milestone: Milestone; application: ApplicationSummary } | null> {
  return db.transaction(async (tx) => {
    const app = await findOwnedApplication(tx, userId, applicationId);
    if (!app) return null;

    const existing = sortByStepOrder(
      await tx
        .select()
        .from(milestones)
        .where(eq(milestones.applicationId, applicationId)),
    );

    // Position is clamped to [0, count] — "insert at position or append".
    const position = Math.min(input.position ?? existing.length, existing.length);
    const { shifts, newStepOrder } = computeInsertShift(existing, position);
    for (const s of shifts) {
      await tx
        .update(milestones)
        .set({ stepOrder: s.stepOrder })
        .where(eq(milestones.id, s.id));
    }

    const [milestone] = await tx
      .insert(milestones)
      .values({
        applicationId,
        stepOrder: newStepOrder,
        title: sanitizeText(input.title) ?? input.title,
        status: "pending",
        comment: sanitizeText(input.comment),
        date: input.date ?? null,
      })
      .returning();

    const all = sortByStepOrder(
      await tx
        .select()
        .from(milestones)
        .where(eq(milestones.applicationId, applicationId)),
    );
    const status = deriveStatus(app.status, all);
    const totalSteps = totalStepsAfterInsert(existing.length);

    const [updatedApp] = await tx
      .update(applications)
      .set({ status, totalSteps, updatedAt: new Date() })
      .where(eq(applications.id, applicationId))
      .returning();

    return { milestone, application: summary(updatedApp, all) };
  });
}

export async function updateMilestone(
  userId: string,
  milestoneId: string,
  input: UpdateMilestoneInput,
): Promise<{ milestone: Milestone; application: ApplicationSummary } | null> {
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select()
      .from(milestones)
      .where(eq(milestones.id, milestoneId))
      .limit(1);
    if (!m) return null;

    const app = await findOwnedApplication(tx, userId, m.applicationId);
    if (!app) return null;

    const values: Partial<Milestone> = {};
    if (input.title !== undefined)
      values.title = sanitizeText(input.title) ?? input.title;
    if (input.status !== undefined) values.status = input.status;
    if (input.comment !== undefined)
      values.comment = sanitizeText(input.comment);
    if (input.date !== undefined) values.date = input.date;

    // Auto-record today's date when a milestone is marked done (editable later
    // via the edit dialog, which sends an explicit date).
    if (input.status === "done" && input.date === undefined && !m.date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      values.date = today;
    }

    const [updated] = await tx
      .update(milestones)
      .set(values)
      .where(eq(milestones.id, milestoneId))
      .returning();

    const all = sortByStepOrder(
      await tx
        .select()
        .from(milestones)
        .where(eq(milestones.applicationId, app.id)),
    );

    // Timeline invariant: done milestones always come before pending ones
    // (marking a milestone done out of order reorganizes the steps). Stable:
    // done first (by step_order), then everything else (by step_order).
    const reordered = [...all].sort((a, b) => {
      const aDone = a.status === "done" ? 0 : 1;
      const bDone = b.status === "done" ? 0 : 1;
      if (aDone !== bDone) return aDone - bDone;
      return a.stepOrder - b.stepOrder;
    });
    for (let i = 0; i < reordered.length; i++) {
      if (reordered[i].stepOrder !== i) {
        await tx
          .update(milestones)
          .set({ stepOrder: i })
          .where(eq(milestones.id, reordered[i].id));
      }
    }

    const status = deriveStatus(app.status, reordered);

    const [updatedApp] = await tx
      .update(applications)
      .set({ status, updatedAt: new Date() })
      .where(eq(applications.id, app.id))
      .returning();

    return { milestone: updated, application: summary(updatedApp, all) };
  });
}

export async function deleteMilestone(
  userId: string,
  milestoneId: string,
): Promise<{ application: ApplicationSummary } | null> {
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select()
      .from(milestones)
      .where(eq(milestones.id, milestoneId))
      .limit(1);
    if (!m) return null;

    const app = await findOwnedApplication(tx, userId, m.applicationId);
    if (!app) return null;

    const existing = sortByStepOrder(
      await tx
        .select()
        .from(milestones)
        .where(eq(milestones.applicationId, app.id)),
    );
    const shift = computeDeleteShift(existing, milestoneId);
    if (!shift) return null;

    await tx.delete(milestones).where(eq(milestones.id, milestoneId));
    for (const s of shift.shifts) {
      await tx
        .update(milestones)
        .set({ stepOrder: s.stepOrder })
        .where(eq(milestones.id, s.id));
    }

    const all = sortByStepOrder(
      await tx
        .select()
        .from(milestones)
        .where(eq(milestones.applicationId, app.id)),
    );
    const status = deriveStatus(app.status, all);
    const totalSteps = totalStepsAfterDelete(existing.length);

    const [updatedApp] = await tx
      .update(applications)
      .set({ status, totalSteps, updatedAt: new Date() })
      .where(eq(applications.id, app.id))
      .returning();

    return { application: summary(updatedApp, all) };
  });
}

/* ------------------------------------------------------------------ */
/* Dashboard stats                                                      */
/* ------------------------------------------------------------------ */

export interface DashboardStats {
  total: number;
  active: number;
  interviewing: number;
  offers: number;
  rejected: number;
  ghosted: number;
}

export async function getStats(userId: string): Promise<DashboardStats> {
  const rows = await db
    .select({ status: applications.status, updatedAt: applications.updatedAt })
    .from(applications)
    .where(eq(applications.userId, userId));

  const stats: DashboardStats = {
    total: 0,
    active: 0,
    interviewing: 0,
    offers: 0,
    rejected: 0,
    ghosted: 0,
  };

  for (const r of rows) {
    if (r.status === "archived") continue;
    stats.total += 1;

    const display = displayStatusOf(r.status, r.updatedAt);
    if (display === "ghosted") {
      stats.ghosted += 1;
      continue;
    }
    if (display === "interviewing") stats.interviewing += 1;
    if (display === "offer") stats.offers += 1;
    if (display === "rejected") stats.rejected += 1;
    if (display === "applied" || display === "interviewing") {
      stats.active += 1;
    }
  }
  return stats;
}
