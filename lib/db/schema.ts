import {
  pgEnum,
  pgTable,
  index,
  integer,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/** How the user account was created. */
export const providerEnum = pgEnum("provider", ["google", "linkedin", "email"]);

/** Application lifecycle status. `applied | interviewing | offer` are derived
 *  from milestone progress; `rejected | archived` are manual terminal states. */
export const applicationStatusEnum = pgEnum("application_status", [
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "archived",
]);

export const milestoneStatusEnum = pgEnum("milestone_status", [
  "pending",
  "done",
  "skipped",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull().unique(),
    // Nullable for OAuth-only accounts.
    passwordHash: text("password_hash"),
    name: text("name").notNull(),
    provider: providerEnum("provider").notNull().default("email"),
    providerId: text("provider_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("users_email_idx").on(t.email)],
);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    company: text("company").notNull(),
    role: text("role").notNull(),
    url: text("url"),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    notes: text("notes"),
    status: applicationStatusEnum("status").notNull().default("applied"),
    // The status an archived application had before archiving, so Reopen can
    // restore it exactly (including manual states like 'rejected').
    archivedFromStatus: applicationStatusEnum("archived_from_status"),
    totalSteps: integer("total_steps").notNull().default(5),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("applications_user_id_idx").on(t.userId)],
);

export const milestones = pgTable(
  "milestones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    stepOrder: integer("step_order").notNull(),
    title: text("title").notNull(),
    status: milestoneStatusEnum("status").notNull().default("pending"),
    comment: text("comment"),
    date: timestamp("date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("milestones_application_id_idx").on(t.applicationId),
    index("milestones_app_step_idx").on(t.applicationId, t.stepOrder),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // SHA-256 hash of the raw token; the raw value is only ever shown once.
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("prt_user_id_idx").on(t.userId)],
);

export const usersRelations = relations(users, ({ many }) => ({
  applications: many(applications),
}));

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  user: one(users, {
    fields: [applications.userId],
    references: [users.id],
  }),
  milestones: many(milestones),
}));

export const milestonesRelations = relations(milestones, ({ one }) => ({
  application: one(applications, {
    fields: [milestones.applicationId],
    references: [applications.id],
  }),
}));

export const passwordResetTokensRelations = relations(
  passwordResetTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [passwordResetTokens.userId],
      references: [users.id],
    }),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type Milestone = typeof milestones.$inferSelect;
export type NewMilestone = typeof milestones.$inferInsert;
export type ApplicationStatus = (typeof applicationStatusEnum.enumValues)[number];
export type MilestoneStatus = (typeof milestoneStatusEnum.enumValues)[number];
export type Provider = (typeof providerEnum.enumValues)[number];
