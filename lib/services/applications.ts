import { and, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import {
  applications,
  milestones,
  users,
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
  ghostedAfterDays,
  ghostedCutoff,
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
  sort?: "company" | "status" | "updated_at" | "progress";
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

/** The user's patience setting, i.e. days before an application is ghosted. */
export async function ghostedDaysFor(userId: string): Promise<number> {
  const [row] = await db
    .select({ level: users.patienceLevel })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return ghostedAfterDays(row?.level);
}

export async function listApplications(
  userId: string,
  filters: ListFilters,
): Promise<ListResult> {
  const { status, search, sort, page, limit } = filters;

  const days = await ghostedDaysFor(userId);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const conditions = [eq(applications.userId, userId)];
  if (status === "ghosted") {
    // Filed here by hand, or applied|interviewing and gone quiet past the
    // user's patience window.
    conditions.push(
      or(
        eq(applications.status, "ghosted"),
        and(
          inArray(applications.status, ["applied", "interviewing"]),
          sql`${applications.updatedAt} < ${new Date(cutoff).toISOString()}`,
        ),
      )!,
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
    case "progress":
      // Progress is derived from milestones (done / total steps), so order
      // by the same ratio in SQL — favourites stay pinned on top.
      orderBy = [
        sql`${applications.isFavorite} desc`,
        sql`(
          select count(*)::float / nullif(${applications.totalSteps}, 0)
          from milestones m
          where m.application_id = ${applications.id}
            and m.status = 'done'
        ) desc`,
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

  // The total comes back with the page itself: `count(*) over ()` is evaluated
  // before LIMIT, so one query yields both the rows and how many matched. It
  // used to be a separate count query per call, and this call runs once per
  // board column — six counts per dashboard load for numbers the rows already
  // carry.
  //
  // The only case the window cannot answer is an empty page *past the first*,
  // which happens when rows disappear between requests: then the total would
  // read as 0 and the section header would say "0 applications" above nothing.
  // That one case pays for a real count.
  const rows = await db
    .select({ application: applications, count: sql<number>`count(*) over ()::int` })
    .from(applications)
    .where(where)
    .orderBy(...orderBy)
    .limit(limit)
    .offset((page - 1) * limit);

  const apps = rows.map((r) => r.application);
  const count =
    rows.length > 0
      ? Number(rows[0].count)
      : page > 1
        ? (
            await db
              .select({ count: sql<number>`count(*)::int` })
              .from(applications)
              .where(where)
          )[0].count
        : 0;

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
        displayStatus: displayStatusOf(app.status, app.updatedAt, days),
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

  // Both the patience lookup and the milestones are keyed on what we just
  // fetched, and on nothing else, so they are fetched together.
  const [days, msRows] = await Promise.all([
    ghostedDaysFor(userId),
    db
      .select()
      .from(milestones)
      .where(eq(milestones.applicationId, app.id)),
  ]);
  const ms = sortByStepOrder(msRows);

  return {
    ...app,
    milestones: ms,
    progress: calcProgress({
      status: app.status,
      milestones: ms,
      totalSteps: app.totalSteps,
    }),
    displayStatus: displayStatusOf(app.status, app.updatedAt, days),
  };
}

/**
 * Unverified accounts may create at most this many applications total.
 * Configurable via env (UNVERIFIED_APP_LIMIT) so the cap can be tuned
 * without a deploy. Exported so the server can hand the same number to the
 * client for the FAB gate.
 */
export const UNVERIFIED_APP_LIMIT = Math.max(
  1,
  Number(process.env.UNVERIFIED_APP_LIMIT ?? 3),
);

/**
 * Total number of applications owned by the user (including archived ones).
 * Used to enforce the "unverified email ⇒ max 3 applications" cap — archived
 * applications still count so the cap cannot be gamed by archiving.
 */
/**
 * Role titles this user has already used, most recently used first — the
 * autocomplete behind the role field. Bookkeeping is not involved: it reads the
 * applications themselves, so there is nothing extra to keep in sync.
 */
export async function listUsedRoles(
  userId: string,
  limit = 20,
): Promise<string[]> {
  const rows = await db
    .select({
      role: applications.role,
      lastUsed: sql<string>`max(${applications.updatedAt})`,
    })
    .from(applications)
    .where(eq(applications.userId, userId))
    .groupBy(applications.role)
    .orderBy(sql`max(${applications.updatedAt}) desc`)
    .limit(limit);

  return rows.map((r) => r.role).filter(Boolean);
}

export async function countApplications(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(applications)
    .where(eq(applications.userId, userId));
  return row?.count ?? 0;
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
        companyWebsite: input.companyWebsite ?? null,
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
  // When archiving via a direct status update, remember the previous status
  // so a later reopen can restore it (instead of always falling back to
  // "applied").
  let archivedFromStatus: Application["status"] | null | undefined;
  if (input.status === "archived") {
    const [existing] = await db
      .select({ status: applications.status })
      .from(applications)
      .where(
        and(eq(applications.id, applicationId), eq(applications.userId, userId)),
      )
      .limit(1);
    if (existing && existing.status !== "archived") {
      archivedFromStatus = existing.status;
    }
  }

  // `updated_at` is what the ghosted clock and the "Updated …" line read, so it
  // only moves when the application's *state* does. Editing notes, the company
  // website or contact details is bookkeeping, not progress: it must not
  // un-ghost an application or make it look freshly touched.
  const values: Partial<Application> = {};
  if (input.status !== undefined) values.updatedAt = new Date();
  if (input.company !== undefined)
    values.company = sanitizeText(input.company) ?? input.company;
  if (input.role !== undefined)
    values.role = sanitizeText(input.role) ?? input.role;
  if (input.url !== undefined) values.url = input.url || null;
  if (input.companyWebsite !== undefined)
    values.companyWebsite = input.companyWebsite ?? null;
  if (input.contactName !== undefined)
    values.contactName = sanitizeText(input.contactName);
  if (input.contactEmail !== undefined)
    values.contactEmail = sanitizeText(input.contactEmail);
  if (input.contactPhone !== undefined)
    values.contactPhone = sanitizeText(input.contactPhone);
  if (input.notes !== undefined) values.notes = sanitizeText(input.notes);
  if (input.status !== undefined) values.status = input.status;
  if (archivedFromStatus !== undefined) {
    values.archivedFromStatus = archivedFromStatus;
  }

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
/**
 * Send the timeline back to the start: every step returns to `pending` and
 * loses its date, so progress reads 0% again without losing the step titles
 * the user wrote. The application's own status is re-derived from the reset
 * steps, which lands it back at `applied`.
 */
export async function resetTimeline(
  userId: string,
  applicationId: string,
): Promise<{ application: Application; milestones: Milestone[] } | null> {
  return db.transaction(async (tx) => {
    const app = await lockOwnedApplication(tx, userId, applicationId);
    if (!app) return null;

    await tx
      .update(milestones)
      .set({ status: "pending", date: null })
      .where(eq(milestones.applicationId, applicationId));

    const all = sortByStepOrder(
      await tx
        .select()
        .from(milestones)
        .where(eq(milestones.applicationId, applicationId)),
    );
    const [updatedApp] = await tx
      .update(applications)
      .set({
        status: deriveStatus(app.status, all),
        totalSteps: all.length,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId))
      .returning();

    return { application: updatedApp, milestones: all };
  });
}

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
    .where(
      and(eq(applications.id, applicationId), eq(applications.userId, userId)),
    )
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
    .where(
      and(eq(applications.id, applicationId), eq(applications.userId, userId)),
    )
    .returning();
  return updated ?? null;
}

/* ------------------------------------------------------------------ */
/* Milestones                                                           */
/* ------------------------------------------------------------------ */

type Tx = PostgresJsDatabase<typeof schema>;

/**
 * Lock the application row for the duration of the transaction
 * (SELECT ... FOR UPDATE). Serializes concurrent milestone mutations on the
 * same application so two writers cannot interleave step_order shifts and
 * transiently duplicate step_order values.
 */
async function lockOwnedApplication(tx: Tx, userId: string, applicationId: string) {
  const [app] = await tx
    .select()
    .from(applications)
    .where(
      and(eq(applications.id, applicationId), eq(applications.userId, userId)),
    )
    .for("update")
    .limit(1);
  return app ?? null;
}

export async function addMilestone(
  userId: string,
  applicationId: string,
  input: CreateMilestoneInput,
): Promise<{ milestone: Milestone; application: ApplicationSummary } | null> {
  return db.transaction(async (tx) => {
    const app = await lockOwnedApplication(tx, userId, applicationId);
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

    const app = await lockOwnedApplication(tx, userId, m.applicationId);
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

    const app = await lockOwnedApplication(tx, userId, m.applicationId);
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
  // One aggregate instead of one row per application. This runs on every
  // dashboard load *and* after every mutation (the client invalidates it), and
  // it used to pull every application the user owns just to count them.
  //
  // The ghosted rule is the same one displayStatusOf applies in JS: "applied" or
  // "interviewing" whose updated_at is older than the user's patience window.
  // Expressing it in SQL is what lets the counting happen in the database.
  const days = await ghostedDaysFor(userId);
  // Deliberately `ghostedCutoff(days)` rather than `now()`: the board and the
  // list decide this in JS, and the two clocks disagree exactly at the
  // threshold. Same timestamp, same line.
  const cutoff = ghostedCutoff(days);
  // Two ways an application displays as ghosted, and both have to be here: it
  // was filed there by hand (the status is literally 'ghosted'), or it is an
  // applied/interviewing one that has gone quiet past the patience window. The
  // board's ghosted column uses exactly this disjunction, and the stat card has
  // to agree with the column beneath it.
  //
  // The cutoff goes in as an ISO string with an explicit cast: postgres.js does
  // not know how to send a raw JS Date through a drizzle `sql` fragment and
  // stringifies it into something Postgres rejects.
  const ghostedNow = sql`(
    ${applications.status} = 'ghosted'
    or (
      ${applications.status} in ('applied', 'interviewing')
      and ${applications.updatedAt} < ${cutoff.toISOString()}::timestamptz
    )
  )`;

  const [row] = await db
    .select({
      total: sql<number>`count(*) filter (where ${applications.status} <> 'archived')::int`,
      ghosted: sql<number>`count(*) filter (where ${ghostedNow})::int`,
      interviewing: sql<number>`count(*) filter (where ${applications.status} = 'interviewing' and not ${ghostedNow})::int`,
      offers: sql<number>`count(*) filter (where ${applications.status} = 'offer')::int`,
      rejected: sql<number>`count(*) filter (where ${applications.status} = 'rejected')::int`,
      applied: sql<number>`count(*) filter (where ${applications.status} = 'applied' and not ${ghostedNow})::int`,
    })
    .from(applications)
    .where(eq(applications.userId, userId));

  // "Active" is what is still in play: neither answered nor stale, i.e. the two
  // columns that are not ghosted.
  return {
    total: Number(row.total),
    active: Number(row.applied) + Number(row.interviewing),
    interviewing: Number(row.interviewing),
    offers: Number(row.offers),
    rejected: Number(row.rejected),
    ghosted: Number(row.ghosted),
  };
}
