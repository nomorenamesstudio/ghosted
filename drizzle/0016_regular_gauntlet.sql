CREATE TYPE "public"."agent_pairing_state" AS ENUM('waiting', 'claimed', 'approved');--> statement-breakpoint
CREATE TYPE "public"."agent_scope" AS ENUM('read', 'edit', 'full');--> statement-breakpoint
CREATE TABLE "agent_pairings" (
	"code" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"scope" "agent_scope" NOT NULL,
	"state" "agent_pairing_state" DEFAULT 'waiting' NOT NULL,
	"secret" text,
	"handovers" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"secret_hash" text NOT NULL,
	"scope" "agent_scope" DEFAULT 'read' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "agent_tokens_secret_hash_unique" UNIQUE("secret_hash")
);
--> statement-breakpoint
ALTER TABLE "agent_pairings" ADD CONSTRAINT "agent_pairings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD CONSTRAINT "agent_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_pairings_user_id_idx" ON "agent_pairings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_tokens_user_id_idx" ON "agent_tokens" USING btree ("user_id");