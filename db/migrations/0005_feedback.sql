CREATE TABLE "feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"sender_account" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'NEW' NOT NULL,
	"handled_by" text,
	"handled_at" timestamp (6) with time zone,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_content_len" CHECK (char_length("feedback"."content") BETWEEN 1 AND 5000),
	CONSTRAINT "feedback_status_check" CHECK ("feedback"."status" IN ('NEW', 'IN_PROGRESS', 'DONE', 'REJECTED')),
	CONSTRAINT "feedback_handled_pair" CHECK (("feedback"."handled_by" IS NULL) = ("feedback"."handled_at" IS NULL))
);
--> statement-breakpoint
CREATE INDEX "feedback_created_idx" ON "feedback" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "feedback_sender_idx" ON "feedback" USING btree ("sender_account","created_at");