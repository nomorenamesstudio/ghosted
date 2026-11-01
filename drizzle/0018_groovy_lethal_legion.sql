ALTER TABLE "applications" ADD COLUMN "url_key" text;--> statement-breakpoint
CREATE INDEX "applications_user_url_key_idx" ON "applications" USING btree ("user_id","url_key");