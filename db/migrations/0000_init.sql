CREATE TYPE "public"."InboxStatus" AS ENUM('PENDING', 'DONE', 'RETURNED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."RequestPriority" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."StepRole" AS ENUM('CONFIRM', 'DECIDE');--> statement-breakpoint
CREATE TABLE "approval_inbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_system" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"step_no" integer NOT NULL,
	"role" "StepRole" NOT NULL,
	"assignee_account" text NOT NULL,
	"status" "InboxStatus" NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"requester_name" text NOT NULL,
	"priority" "RequestPriority" DEFAULT 'LOW' NOT NULL,
	"deep_link" text NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submitted_at" timestamp (6) with time zone NOT NULL,
	"acted_at" timestamp (6) with time zone,
	"source_version" timestamp (6) with time zone NOT NULL,
	CONSTRAINT "approval_inbox_step_no_positive" CHECK ("approval_inbox"."step_no" > 0)
);
--> statement-breakpoint
CREATE TABLE "inbox_systems" (
	"key" text PRIMARY KEY NOT NULL,
	"name_vi" text NOT NULL,
	"name_ja" text NOT NULL,
	"base_url" text NOT NULL,
	"token_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval_inbox" ADD CONSTRAINT "approval_inbox_source_system_inbox_systems_key_fk" FOREIGN KEY ("source_system") REFERENCES "public"."inbox_systems"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "approval_inbox_source_step_key" ON "approval_inbox" USING btree ("source_system","source_id","step_no");--> statement-breakpoint
CREATE INDEX "approval_inbox_assignee_status_idx" ON "approval_inbox" USING btree ("assignee_account","status","submitted_at","id");