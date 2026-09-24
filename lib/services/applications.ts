import { and, eq, gt, gte, ilike, inArray, lte, ne, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import {
  applications,
  companyLogos,
  milestones,
  users,
  type Application,
  type ApplicationStatus,
  type Milestone,
} from "@/lib/db/schema";
import { calcProgress } from "@/lib/utils/progress";
import {
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
  signalEffect,
  timelineSignalAt,
  STATUS_ORDER,
  type DisplayStatus,
} from "@/lib/utils/status";
import type {
  CreateApplicationInput,
  CreateMilestoneInput,
  UpdateApplicationInput,
  UpdateMilestoneInput,
} from "@/lib/utils/validation";
import { logoDomainCandidates } from "@/lib/utils/company-domain";
import { logoIsKnownMissing, logoMissingFrom } from "@/lib/services/company-logos";

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
  /**
   * The logo cache already knows this company has no logo, so the avatar goes
   * straight to the monogram instead of asking `/logos/:id` for a 404.
   */
  logoMissing: boolean;
}

/**
 * One card's worth of data: what the board and the list actually render, and the
 * exact shape the list query selects.
 *
 * Deliberately narrower than the whole `applications` row. The list endpoint
 * used to serialize every column — `notes`, the three contact fields, `userId`,
 * `createdAt`, `archivedFromStatus` — none of which a card reads; the detail page
 * fetches the full row through `getApplication`. On a board of 22 applications
 * that was 12 kB of JSON across the six per-status requests.
 *
 * Defined here, next to the query that produces it, and re-exported by
 * `lib/api.ts` for the client. It used to be declared in both places, which is
 * how the two drifted apart.
 */
export interface ApplicationListItem {
  id: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  updatedAt: Application["updatedAt"];
  isFavorite: boolean;
  url: string | null;
  companyWebsite: string | null;
  totalSteps: number;
  progress: number;
  currentRound: string | null;
  milestoneCount: number;
  /** Effective status — "ghosted" when the app is stale (time-derived). */
  displayStatus: DisplayStatus;
  /**
   * True when the logo cache already knows that none of this company's candidate
   * domains has a logo: the card then renders its monogram without asking
   * `/logos/:id` for an answer the server already has. Without it every such card
   * opened a request that could only end in a 404.
   */
  logoMissing?: boolean;
}

export interface ListResult {
  data: ApplicationListItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/** How a board column or list section can be ordered. */
export type SortKey = "company" | "status" | "updated_at" | "progress";

export interface ListFilters {
  status?: DisplayStatus;
  search?: string;
  sort?: SortKey;
  page: number;
  limit: number;
}

function summary(
  app: Pick<Application, "id" | "status" | "totalSteps">,
  ms: MilestoneForList[],
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

function currentRound(ms: MilestoneForList[]): string | null {
  const done = ms.filter((m) => m.status === "done");
  if (done.length > 0) {
    return [...done].sort((a, b) => b.stepOrder - a.stepOrder)[0].title;
  }
  return ms[0]?.title ?? null;
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * The milestone fields the list's card maths reads — and all the list query
 * selects. A page of 50 applications can carry a few hundred milestone rows, so
 * the unread columns (notes, dates, ids) are worth leaving in the database. Full
 * `Milestone` rows still satisfy it, which is what the detail path passes.
 */
type MilestoneForList = Pick<Milestone, "status" | "stepOrder" | "title">;

/** The application columns a card renders, and the only ones the list selects. */
type ListAppRow = Pick<
  Application,
  | "id"
  | "company"
  | "role"
  | "status"
  | "updatedAt"
  | "isFavorite"
  | "url"
  | "companyWebsite"
  | "totalSteps"
>;

/** The card columns, spelled out once for both the list and the board query. */
const LIST_APP_COLUMNS = {
  id: applications.id,
  company: applications.company,
  role: applications.role,
  status: applications.status,
  updatedAt: applications.updatedAt,
  isFavorite: applications.isFavorite,
  url: applications.url,
  companyWebsite: applications.companyWebsite,
  totalSteps: applications.totalSteps,
} as const;

/** Sort order shared by the list and the board, so a column can never disagree. */
function orderByFor(sort?: SortKey): SQL[] {
  switch (sort ?? "updated_at") {
    case "company":
      return [
        sql`${applications.isFavorite} desc`,
        sql`lower(${applications.company}) asc`,
        sql`${applications.updatedAt} desc`,
      ];
    case "status":
      return [
        sql`${applications.isFavorite} desc`,
        sql`case ${applications.status} when 'applied' then 1 when 'interviewing' then 2 when 'offer' then 3 when 'rejected' then 4 when 'archived' then 5 end asc`,
        sql`${applications.updatedAt} desc`,
      ];
    case "progress":
      // Progress is derived from milestones (done / total steps), so order by
      // the same ratio in SQL — favourites stay pinned on top.
      return [
        sql`${applications.isFavorite} desc`,
        sql`(
          select count(*)::float / nullif(${applications.totalSteps}, 0)
          from milestones m
          where m.application_id = ${applications.id}
            and m.status = 'done'
        ) desc`,
        sql`${applications.updatedAt} desc`,
      ];
    default:
      return [
        sql`${applications.isFavorite} desc`,
        sql`${applications.updatedAt} desc`,
        sql`${applications.createdAt} desc`,
      ];
  }
}

/**
 * Which section an application is displayed in, as SQL. The same rule as
 * `displayStatusOf`, expressed once: filed as ghosted by hand, or an
 * applied/interviewing row that has gone quiet past the patience window.
 */
function displayStatusSql(cutoffIso: string): SQL<DisplayStatus> {
  return sql<DisplayStatus>`case
    when ${applications.status} = 'archived' then 'archived'
    when ${applications.status} = 'ghosted' then 'ghosted'
    when ${applications.status} in ('applied', 'interviewing')
      and ${applications.updatedAt} < ${cutoffIso}::timestamptz then 'ghosted'
    else ${applications.status}::text
  end`;
}

/**
 * Turn application rows into cards: one extra query for every milestone of every
 * row, then the derived fields the card shows (progress, current round, count and
 * the display status time decides).
 */
async function buildListItems(
  apps: ListAppRow[],
  days: number,
): Promise<ApplicationListItem[]> {
  if (apps.length === 0) return [];

  const msRows = await db
    .select({
      applicationId: milestones.applicationId,
      status: milestones.status,
      stepOrder: milestones.stepOrder,
      title: milestones.title,
    })
    .from(milestones)
    .where(inArray(milestones.applicationId, apps.map((a) => a.id)))
    .orderBy(milestones.stepOrder);

  // Which companies the logo cache already knows have no logo at all. Asking
  // anyway put one 404 in the console per card; the card skips the request when
  // the answer is already known, and still asks when a domain is merely uncached
  // (the route would then go and fetch it).
  const candidateDomains = new Map<string, string[]>();
  for (const app of apps) {
    candidateDomains.set(
      app.id,
      logoDomainCandidates(app.company, app.url, app.companyWebsite),
    );
  }
  const allDomains = Array.from(
    new Set(Array.from(candidateDomains.values()).flat()),
  );
  const knownMissing = new Set<string>();
  if (allDomains.length > 0) {
    const rows = await db
      .select({ domain: companyLogos.domain })
      .from(companyLogos)
      .where(
        and(
          inArray(companyLogos.domain, allDomains),
          eq(companyLogos.status, "none"),
        ),
      );
    for (const row of rows) knownMissing.add(row.domain);
  }

  const byApp = new Map<string, MilestoneForList[]>();
  for (const m of msRows) {
    const list = byApp.get(m.applicationId) ?? [];
    list.push(m);
    byApp.set(m.applicationId, list);
  }

  return apps.map((app) => {
    const ms = byApp.get(app.id) ?? [];
    return {
      ...app,
      progress: calcProgress({
        status: app.status,
        milestones: ms,
        totalSteps: app.totalSteps,
      }),
      currentRound: currentRound(ms),
      milestoneCount: ms.length,
      displayStatus: displayStatusOf(app.status, app.updatedAt, days),
      logoMissing: logoMissingFrom(
        candidateDomains.get(app.id) ?? [],
        knownMissing,
      ),
    };
  });
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

/**
 * One section of the board: its first page of cards and how many it holds, in
 * exactly the shape the per-status list endpoint returns — because a section
 * falls back to that endpoint for "load more" and the two must be
 * interchangeable.
 */
export interface BoardSection {
  data: ApplicationListItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface BoardFilters {
  search?: string;
  sort?: SortKey;
  /** Cards per section — the same default the board uses per column. */
  limit?: number;
}

/**
 * The board's first paint, in one query.
 *
 * The dashboard used to make six requests — one per column — each running its
 * own `count(*)` and its own page query, all with different WHERE clauses that
 * were really one partition (a stale application belongs to the ghosted section
 * and to no other). This asks the database once: partition by the display status,
 * number the rows inside each partition by the shared sort, and keep the first
 * `limit` of each. The section totals ride along on every row, so the six counts
 * disappear too.
 *
 * `load more` still goes through `listApplications`, which is why a section's
 * shape here matches a page there field for field.
 */
export async function listBoard(
  userId: string,
  filters: BoardFilters = {},
): Promise<Record<DisplayStatus, BoardSection>> {
  const { search, sort, limit = 50 } = filters;

  const days = await ghostedDaysFor(userId);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const display = displayStatusSql(cutoff);

  const conditions = [eq(applications.userId, userId)];
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push(
      or(
        ilike(applications.company, pattern),
        ilike(applications.role, pattern),
      )!,
    );
  }

  const orderBy = orderByFor(sort);
  const rank = sql`row_number() over (partition by ${display} order by ${sql.join(
    orderBy,
    sql`, `,
  )})::int`;

  // Window functions cannot be filtered in the same SELECT, so the ranking is
  // computed in a subquery and the first page of each section is taken outside
  // it. Drizzle has no fluent wrapper for that, and the shape here is small
  // enough to read as SQL.
  const ranked = db
    .select({
      ...LIST_APP_COLUMNS,
      section: display.as("section"),
      sectionTotal: sql<number>`count(*) over (partition by ${display})::int`.as(
        "section_total",
      ),
      rank: rank.as("rank"),
    })
    .from(applications)
    .where(and(...conditions))
    .as("ranked");

  const rows = await db
    .select()
    .from(ranked)
    .where(lte(ranked.rank, limit));

  // Every section's total, read off the rows that carry it.
  const totals = new Map<DisplayStatus, number>();
  for (const row of rows) {
    if (!totals.has(row.section)) totals.set(row.section, Number(row.sectionTotal));
  }

  // One milestones query and one pass of card maths for the whole board —
  // building each section separately would put six more queries back.
  const items = await buildListItems(
    rows.map((r) => ({
      id: r.id,
      company: r.company,
      role: r.role,
      status: r.status,
      updatedAt: r.updatedAt,
      isFavorite: r.isFavorite,
      url: r.url,
      companyWebsite: r.companyWebsite,
      totalSteps: r.totalSteps,
    })),
    days,
  );

  const sections = {} as Record<DisplayStatus, BoardSection>;
  for (const status of STATUS_ORDER) {
    const total = totals.get(status) ?? 0;
    sections[status] = {
      data: items.filter((item) => item.displayStatus === status),
      pagination: {
        page: 1,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  return sections;
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

  const orderBy = orderByFor(sort);

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
    .select({
      application: LIST_APP_COLUMNS,
      count: sql<number>`count(*) over ()::int`,
    })
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

  const data = await buildListItems(apps, days);

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
  // fetched, and on nothing else, so they are fetched together. The logo
  // question rides along: the detail page renders the same avatar as a card, and
  // without the answer it asks `/logos/:id` for a company whose every candidate
  // domain is already known to have no logo — one 404 in the console per visit.
  const [days, msRows, logoMissing] = await Promise.all([
    ghostedDaysFor(userId),
    db
      .select()
      .from(milestones)
      .where(eq(milestones.applicationId, app.id)),
    logoIsKnownMissing(app.company, app.url, app.companyWebsite),
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
    logoMissing,
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
      // Nothing can be cached for an application created a moment ago, so the
      // avatar asks - unless this company has no candidate domain at all.
      logoMissing: logoMissingFrom(
        logoDomainCandidates(app.company, app.url, app.companyWebsite),
        new Set(),
      ),
    };
  });
}

export async function updateApplication(
  userId: string,
  applicationId: string,
  input: UpdateApplicationInput,
): Promise<Application | null> {
  // The silence clock is read from the *previous* status, so the row is read
  // first whenever a status is part of the patch. That read also feeds the
  // archive case: when archiving via a direct status update, remember the
  // previous status so a later reopen can restore it (instead of always falling
  // back to "applied").
  let existing: Application | undefined;
  if (input.status !== undefined) {
    [existing] = await db
      .select()
      .from(applications)
      .where(
        and(eq(applications.id, applicationId), eq(applications.userId, userId)),
      )
      .limit(1);
  }

  // `updated_at` is the silence clock the ghosted rule and the "Updated …" line
  // read, so only employer-facing events move it. A patch that merely repeats
  // the status it just read is bookkeeping (the edit modal sends the whole
  // form), and a step back is a correction that puts the clock back on the
  // timeline's evidence rather than restarting it.
  const values: Partial<Application> = {};
  if (existing && input.status !== undefined) {
    const effect = signalEffect(existing.status, input.status);
    if (effect === "advance") {
      values.updatedAt = new Date();
    } else if (effect === "restore") {
      const timeline = await db
        .select({
          status: milestones.status,
          date: milestones.date,
          createdAt: milestones.createdAt,
        })
        .from(milestones)
        .where(eq(milestones.applicationId, applicationId));
      values.updatedAt = timelineSignalAt(existing.createdAt, timeline);
    }
  }
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
  if (
    input.status === "archived" &&
    existing &&
    existing.status !== "archived"
  ) {
    values.archivedFromStatus = existing.status;
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
      // Archiving is not employer activity: the silence clock stays where it
      // was, so an archived card does not claim to have been touched just now.
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
 * Send the timeline back to the application itself: the first step (the
 * application) stays done, everything after it returns to `pending` and loses
 * its date. The status is re-derived from the result, which lands on `applied`.
 *
 * The first step used to be cleared too, which made an application sitting in
 * Applied read as though it had never been sent — and left progress at 0% for a
 * process that had at least started.
 */
export async function resetTimeline(
  userId: string,
  applicationId: string,
): Promise<{ application: Application; milestones: Milestone[] } | null> {
  return db.transaction(async (tx) => {
    const app = await lockOwnedApplication(tx, userId, applicationId);
    if (!app) return null;

    const existing = sortByStepOrder(
      await tx
        .select()
        .from(milestones)
        .where(eq(milestones.applicationId, applicationId)),
    );
    const [first, ...rest] = existing;

    // The application step is where this reset stops. Its date is left alone:
    // that is when the application was sent.
    if (first) {
      await tx
        .update(milestones)
        .set({ status: "done" })
        .where(eq(milestones.id, first.id));
    }
    if (rest.length > 0) {
      await tx
        .update(milestones)
        .set({ status: "pending", date: null })
        .where(
          inArray(
            milestones.id,
            rest.map((m) => m.id),
          ),
        );
    }

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
        // A reset is a correction: the clock goes back to the evidence that
        // survives it - the application itself, whose date a reset keeps.
        updatedAt: timelineSignalAt(app.createdAt, all),
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
    const { newStepOrder } = computeInsertShift(existing, position);

    // One statement rather than one UPDATE per shifted row: everything at or
    // after the insert position moves up by exactly one, which is a range, not a
    // list (see computeInsertShift).
    if (position < existing.length) {
      await tx
        .update(milestones)
        .set({ stepOrder: sql`${milestones.stepOrder} + 1` })
        .where(
          and(
            eq(milestones.applicationId, applicationId),
            gte(milestones.stepOrder, position),
          ),
        );
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
      .set({
        status,
        totalSteps,
        // Adding a step is something you learned about the process, so the
        // silence clock starts over. (Removing one is a correction - see
        // deleteMilestone.)
        updatedAt: new Date(),
      })
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
    // Renumber in one statement rather than one UPDATE per moved row. Safe as a
    // single pass because nothing unique-constrains (application_id, step_order):
    // a row can pass through another row's old position mid-statement.
    const renumber = reordered
      .map((m, i) =>
        m.stepOrder === i ? null : sql`when ${milestones.id} = ${m.id} then ${i}`,
      )
      .filter((clause): clause is SQL => clause !== null);
    if (renumber.length > 0) {
      await tx
        .update(milestones)
        .set({
          stepOrder: sql`case ${sql.join(renumber, sql` `)} else ${milestones.stepOrder} end`,
        })
        .where(eq(milestones.applicationId, app.id));
    }

    const status = deriveStatus(app.status, reordered);

    // A comment, a title or a date on a step is bookkeeping and must not move
    // the clock (the same rule as the notes on the application). Only the
    // step's own state is progress: marking it done restarts the silence, and
    // undoing that is a correction that puts the clock back on the evidence
    // left on the timeline.
    const stepStatusChanged =
      input.status !== undefined && input.status !== m.status;
    const appValues: Partial<Application> = { status };
    if (stepStatusChanged) {
      appValues.updatedAt =
        input.status === "done"
          ? new Date()
          : timelineSignalAt(app.createdAt, reordered);
    }

    const [updatedApp] = await tx
      .update(applications)
      .set(appValues)
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

    await tx.delete(milestones).where(eq(milestones.id, milestoneId));
    // The mirror of the insert shift: everything after the deleted step moves
    // down by one, so it is a range update rather than a list of rows.
    await tx
      .update(milestones)
      .set({ stepOrder: sql`${milestones.stepOrder} - 1` })
      .where(
        and(
          eq(milestones.applicationId, app.id),
          gt(milestones.stepOrder, m.stepOrder),
        ),
      );

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
      .set({
        status,
        totalSteps,
        // Deleting a step is a correction, not progress: the clock goes back to
        // the evidence that is left rather than restarting.
        updatedAt: timelineSignalAt(app.createdAt, all),
      })
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
  // board's ghosted column uses exactly this disjunction, and this aggregate has
  // to agree with the section it counts.
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
