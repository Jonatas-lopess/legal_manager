ALTER TABLE "deadlines" ADD COLUMN "days" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_days_positive" CHECK ("deadlines"."days" > 0);