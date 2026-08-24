ALTER TABLE "applications" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN "contact";