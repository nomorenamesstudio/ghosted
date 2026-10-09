import {
  boolean,
  pgEnum,
  pgTable,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
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
  /**
   * Ghosted is both: a user can file an application here by hand, and the
   * display layer shows applied/interviewing applications as ghosted once they
   * go quiet for the user's patience window (see lib/utils/status.ts).
   */
  "ghosted",
]);

export const milestoneStatusEnum = pgEnum("milestone_status", [
  "pending",
  "done",
  "skipped",
]);

/** Outcome of a company-logo lookup: `ok` holds bytes, `none` caches a miss. */
export const logoStatusEnum = pgEnum("logo_status", ["ok", "none"]);

/**
 * How long a silent application waits before it is shown as ghosted.
 * `generous` 14 days, `realistic` 10, `impatient` 7 - see lib/utils/status.ts.
 */
export const patienceLevelEnum = pgEnum("patience_level", [
  "generous",
  "realistic",
  "impatient",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull().unique(),
    // Nullable for OAuth-only accounts.
    passwordHash: text("password_hash"),
    name: text("name").notNull(),
    /** Avatar URL. Null for accounts without a picture (the menu falls back to
     *  initials); OAuth providers fill it, and the demo account points at the
     *  app icon. */
    image: text("image"),
    /**
     * How the account was *created* - its origin, not its current sign-in
     * options. OAuth identities attached to the account live in
     * `oauth_accounts`, one row each, so linking Google and LinkedIn to the same
     * account no longer overwrites the other.
     */
    provider: providerEnum("provider").notNull().default("email"),
    /**
     * The provider's subject id, set when the account was created by OAuth.
     * Accounts created before 1.3.0 hold a random UUID here instead: @auth/core
     * fills `user.id` that way on every sign-in and keeps the provider's own id
     * in `account.providerAccountId` (see `providerAccountId` in lib/auth.ts).
     * Nothing reads this column — linked identities live in `oauth_accounts`.
     */
    providerId: text("provider_id"),
    emailVerified: boolean("email_verified").notNull().default(false),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    /**
     * When a provider sign-in took over an unverified account and cleared its
     * password (the adopt rule in lib/services/oauth-accounts.ts). Drives the
     * one-time notice on the dashboard, and clearing it is the user
     * acknowledging it — the event is only interesting until it has been told.
     */
    passwordDroppedAt: timestamp("password_dropped_at", { withTimezone: true }),
    /**
     * Set when the account was created with a password the *operator* did not
     * choose — the boot-seeded owner, whose generated password is printed to the
     * container log. While it is true the account can sign in and change its
     * password, and nothing else: a password that exists in a log file must not
     * be a working credential for long.
     */
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    /** Threshold for the automatic "ghosted" status; every user has one. */
    patienceLevel: patienceLevelEnum("patience_level")
      .notNull()
      .default("realistic"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("users_email_idx").on(t.email)],
);

/**
 * One OAuth identity linked to an account.
 *
 * An account can hold several (Google *and* LinkedIn) because the provider
 * columns on `users` only ever describe how the account was created: a second
 * provider used to overwrite the first, which both lost the link and made "what
 * is connected?" unanswerable. The pair is globally unique because a provider
 * subject identifies exactly one member, and a member's LinkedIn login must
 * always land on the same account here.
 */
export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: providerEnum("provider").notNull(),
    /** The provider's stable subject id (`sub` for OIDC providers). */
    providerId: text("provider_id").notNull(),
    /** When the identity was first attached - shown in Settings. */
    linkedAt: timestamp("linked_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("oauth_accounts_provider_id_idx").on(t.provider, t.providerId),
    index("oauth_accounts_user_id_idx").on(t.userId),
  ],
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
    /**
     * Employer's own domain, normalized on write (`stripe.com`), and only used
     * to resolve the company logo. It is the reliable answer when the job URL
     * is a board link, and it overrides every guess (see
     * lib/utils/company-domain.ts).
     */
    companyWebsite: text("company_website"),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    notes: text("notes"),
    status: applicationStatusEnum("status").notNull().default("applied"),
    // Favorites are pinned to the top of every list/section.
    isFavorite: boolean("is_favorite").notNull().default(false),
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

/**
 * Company logo cache, keyed by registrable domain rather than by application:
 * two applications at the same company share one row, and the row survives
 * application edits. Rows are written lazily on first view (see
 * lib/services/company-logos.ts); a `none` row is a cached negative so a
 * company without a favicon is not re-fetched on every render.
 *
 * Bytes live here (small, 1-15KB favicons) instead of object storage: they
 * then inherit the normal Postgres backups and add no second dependency to
 * the render path. Drizzle has no `bytea` column type, so the payload is
 * base64 text - the 33% overhead is irrelevant at this size.
 */
export const companyLogos = pgTable(
  "company_logos",
  {
    domain: text("domain").primaryKey(),
    status: logoStatusEnum("status").notNull(),
    /** Where the bytes came from: `google` or `duckduckgo`. */
    source: text("source"),
    contentType: text("content_type"),
    bytesBase64: text("bytes_base64"),
    byteSize: integer("byte_size"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    attempts: integer("attempts").notNull().default(1),
  },
  (t) => [index("company_logos_status_idx").on(t.status)],
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

export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
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
  (t) => [index("evt_user_id_idx").on(t.userId)],
);

export const usersRelations = relations(users, ({ many }) => ({
  applications: many(applications),
  oauthAccounts: many(oauthAccounts),
}));

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, {
    fields: [oauthAccounts.userId],
    references: [users.id],
  }),
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

export const emailVerificationTokensRelations = relations(
  emailVerificationTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [emailVerificationTokens.userId],
      references: [users.id],
    }),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type OAuthAccount = typeof oauthAccounts.$inferSelect;
export type NewOAuthAccount = typeof oauthAccounts.$inferInsert;
export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type Milestone = typeof milestones.$inferSelect;
export type NewMilestone = typeof milestones.$inferInsert;
export type ApplicationStatus = (typeof applicationStatusEnum.enumValues)[number];
export type MilestoneStatus = (typeof milestoneStatusEnum.enumValues)[number];
export type PatienceLevel = (typeof patienceLevelEnum.enumValues)[number];
export type Provider = (typeof providerEnum.enumValues)[number];
export type CompanyLogo = typeof companyLogos.$inferSelect;
export type LogoStatus = (typeof logoStatusEnum.enumValues)[number];
