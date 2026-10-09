CREATE TABLE "oauth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "provider" NOT NULL,
	"provider_id" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_accounts_provider_id_idx" ON "oauth_accounts" USING btree ("provider","provider_id");--> statement-breakpoint
CREATE INDEX "oauth_accounts_user_id_idx" ON "oauth_accounts" USING btree ("user_id");--> statement-breakpoint
-- Backfill: accounts created by OAuth already carry their identity on `users`.
-- Copied rather than derived at read time, so a member signing in through a
-- second provider links to the row that already exists instead of being treated
-- as a new one. `linked_at` reuses `created_at`, the only timestamp available.
INSERT INTO "oauth_accounts" ("user_id", "provider", "provider_id", "linked_at")
SELECT "id", "provider", "provider_id", "created_at"
FROM "users"
WHERE "provider" IN ('google', 'linkedin') AND "provider_id" IS NOT NULL
ON CONFLICT DO NOTHING;