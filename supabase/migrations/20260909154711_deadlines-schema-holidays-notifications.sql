CREATE TYPE "public"."deadline_status" AS ENUM('pendente', 'cumprido');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'in_app');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "civil_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"uf" text,
	"name" text NOT NULL,
	CONSTRAINT "civil_holidays_date_uf_unique" UNIQUE NULLS NOT DISTINCT("date","uf")
);
--> statement-breakpoint
ALTER TABLE "civil_holidays" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "forensic_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"description" text NOT NULL,
	"source_year" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "forensic_holidays" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"category" text NOT NULL,
	"deadline_id" uuid,
	"threshold" text,
	"payload" jsonb NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deadlines" ADD COLUMN "start_date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "deadlines" ADD COLUMN "description" text NOT NULL;--> statement-breakpoint
ALTER TABLE "deadlines" ADD COLUMN "status" "deadline_status" DEFAULT 'pendente' NOT NULL;--> statement-breakpoint
ALTER TABLE "deadlines" ADD COLUMN "due_date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_deadline_id_tenant_id_deadlines_id_tenant_id_fk" FOREIGN KEY ("deadline_id","tenant_id") REFERENCES "public"."deadlines"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_deadline_threshold_channel_unique" ON "notifications" USING btree ("deadline_id","threshold","channel") WHERE "notifications"."deadline_id" is not null;