CREATE TYPE "public"."logo_status" AS ENUM('ok', 'none');--> statement-breakpoint
CREATE TABLE "company_logos" (
	"domain" text PRIMARY KEY NOT NULL,
	"status" "logo_status" NOT NULL,
	"source" text,
	"content_type" text,
	"bytes_base64" text,
	"byte_size" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "company_logos_status_idx" ON "company_logos" USING btree ("status");