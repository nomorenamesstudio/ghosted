import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { applications, milestones } from "@/lib/db/schema";

/**
 * Import a Ghosted export, so an account can move between instances.
 *
 * The export is a raw dump of the rows, so this is the one place that has to
 * know the shape of both tables. Two properties make it safe to run twice:
 *
 * - Duplicates are recognised by what an application *is* — company, role and
 *   creation time — so the same file imported again skips its own rows instead
 *   of growing copies. Row ids are deliberately not reused: they are global, so
 *   importing into a second account on the same instance could never reuse them
 *   without colliding.
 * - Everything lands in one transaction: either the whole file arrives or none
 *   of it does, which matters because `replace` deletes first.
 *
 * What it deliberately ignores: the `user` block (identity stays with the
 * account doing the importing) and the company-logo cache (refetched on demand
 * from the importing instance's own network).
 */

/** Bumped when the shape changes incompatibly; exports carry it. */
export const EXPORT_VERSION = 1;

export const APPLICATION_STATUSES = [
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "archived",
  "ghosted",
] as const;

export const MILESTONE_STATUSES = ["pending", "done", "skipped"] as const;

const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "not a date");

const milestoneSchema = z.object({
  id: z.string().min(1).optional(),
  stepOrder: z.number().int().min(0).max(200),
  title: z.string().min(1).max(200),
  status: z.enum(MILESTONE_STATUSES).default("pending"),
  comment: z.string().max(10_000).nullish(),
  date: isoDate.nullish(),
  createdAt: isoDate.optional(),
});

const applicationSchema = z.object({
  id: z.string().min(1).optional(),
  company: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  url: z.string().max(2_000).nullish(),
  companyWebsite: z.string().max(500).nullish(),
  contactName: z.string().max(200).nullish(),
  contactEmail: z.string().max(320).nullish(),
  contactPhone: z.string().max(100).nullish(),
  notes: z.string().max(20_000).nullish(),
  status: z.enum(APPLICATION_STATUSES).default("applied"),
  isFavorite: z.boolean().default(false),
  archivedFromStatus: z.enum(APPLICATION_STATUSES).nullish(),
  totalSteps: z.number().int().min(1).max(200).default(5),
  createdAt: isoDate.optional(),
  updatedAt: isoDate.optional(),
  milestones: z.array(milestoneSchema).max(200).default([]),
});

export const importFileSchema = z.object({
  version: z.number().int().positive().optional(),
  exportedAt: isoDate.optional(),
  // The importer's own identity wins; a stray user block is ignored on purpose.
  user: z.unknown().optional(),
  applications: z.array(applicationSchema).max(5_000),
});

export type ImportFile = z.infer<typeof importFileSchema>;

export type ImportMode = "merge" | "replace";

export interface ImportResult {
  mode: ImportMode;
  applications: number;
  milestones: number;
  skipped: number;
}

export class ImportError extends Error {
  constructor(
    message: string,
    /** Machine-readable so the route can answer without re-deriving it. */
    readonly code: "UNSUPPORTED_VERSION",
  ) {
    super(message);
    this.name = "ImportError";
  }
}

/**
 * Move every row into `userId`'s account. `replace` empties the account first —
 * inside the same transaction, so a rejected file changes nothing.
 */
export async function importUserData(
  userId: string,
  file: ImportFile,
  mode: ImportMode = "merge",
): Promise<ImportResult> {
  const version = file.version ?? EXPORT_VERSION;
  if (version > EXPORT_VERSION) {
    throw new ImportError(
      `This file was exported by a newer version of Ghosted (format ${version}; this instance understands ${EXPORT_VERSION}).`,
      "UNSUPPORTED_VERSION",
    );
  }

  return db.transaction(async (tx) => {
    if (mode === "replace") {
      // Cascades to milestones, and to nothing else: the account stays.
      await tx.delete(applications).where(eq(applications.userId, userId));
    }

    // Duplicates are recognised by what an application *is* — company, role and
    // the moment it was created — not by its row id. Row ids are global, so a
    // file imported into a second account on the same instance can never reuse
    // them; keying on them would either collide or silently skip the copy. The
    // practical promise is the one users rely on: importing the same file twice
    // changes nothing the second time.
    const existing = await tx
      .select({
        company: applications.company,
        role: applications.role,
        createdAt: applications.createdAt,
      })
      .from(applications)
      .where(eq(applications.userId, userId));
    const seenTimed = new Set(
      existing.map((row) => identityKey(row.company, row.role, row.createdAt)),
    );
    // A file row without a timestamp is matched on company + role alone, against
    // every application the account already has — the rows inserted by a first
    // import were stamped by the database, so a timestamp-keyed lookup would
    // never recognise them and the second import would duplicate everything.
    // Two such rows inside one file collapse, and that collapse is counted as a
    // skip rather than passing silently.
    const seenUntimed = new Set(
      existing.map((row) => roleKey(row.company, row.role)),
    );

    let importedApplications = 0;
    let importedMilestones = 0;
    let skipped = 0;

    for (const app of file.applications) {
      const createdAt = app.createdAt ? new Date(app.createdAt) : null;
      const isDuplicate = createdAt
        ? seenTimed.has(identityKey(app.company, app.role, createdAt))
        : seenUntimed.has(roleKey(app.company, app.role));
      if (isDuplicate) {
        skipped += 1;
        continue;
      }
      if (createdAt) seenTimed.add(identityKey(app.company, app.role, createdAt));
      seenUntimed.add(roleKey(app.company, app.role));

      const [inserted] = await tx
        .insert(applications)
        .values({
          userId,
          company: app.company,
          role: app.role,
          url: app.url ?? null,
          companyWebsite: app.companyWebsite ?? null,
          contactName: app.contactName ?? null,
          contactEmail: app.contactEmail ?? null,
          contactPhone: app.contactPhone ?? null,
          notes: app.notes ?? null,
          status: app.status,
          isFavorite: app.isFavorite,
          archivedFromStatus: app.archivedFromStatus ?? null,
          totalSteps: app.totalSteps,
          ...(app.createdAt ? { createdAt: new Date(app.createdAt) } : {}),
          ...(app.updatedAt ? { updatedAt: new Date(app.updatedAt) } : {}),
        })
        .returning({ id: applications.id });
      importedApplications += 1;

      if (app.milestones.length > 0) {
        // One statement per application rather than one per milestone: a file
        // is imported inside a single transaction, and every round trip there
        // is a lock held for longer.
        await tx.insert(milestones).values(
          app.milestones.map((milestone) => ({
            applicationId: inserted.id,
            stepOrder: milestone.stepOrder,
            title: milestone.title,
            status: milestone.status,
            comment: milestone.comment ?? null,
            date: milestone.date ? new Date(milestone.date) : null,
            ...(milestone.createdAt
              ? { createdAt: new Date(milestone.createdAt) }
              : {}),
          })),
        );
        importedMilestones += app.milestones.length;
      }
    }

    return {
      mode,
      applications: importedApplications,
      milestones: importedMilestones,
      skipped,
    };
  });
}

/**
 * An application's identity for import purposes. `createdAt` is microsecond
 * precision in Postgres, so two applications to the same role at the same
 * company are only "the same" when they really are the same row; a file with no
 * timestamp falls back to company + role.
 */
/** What an application *is*, when the file states a creation time. */
function identityKey(company: string, role: string, createdAt: Date): string {
  return `${roleKey(company, role)}\u0000${createdAt.toISOString()}`;
}

/** The fallback for rows that carry no timestamp: the two stated facts. */
function roleKey(company: string, role: string): string {
  return `${company.toLowerCase()}\u0000${role.toLowerCase()}`;
}
