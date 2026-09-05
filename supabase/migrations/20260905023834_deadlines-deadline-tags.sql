CREATE TYPE "public"."counting_mode" AS ENUM('dias_uteis', 'dias_corridos');--> statement-breakpoint
CREATE TABLE "deadline_tags" (
	"tenant_id" uuid NOT NULL,
	"deadline_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "deadline_tags_deadline_id_tag_id_pk" PRIMARY KEY("deadline_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "deadline_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "deadlines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"matter_id" uuid NOT NULL,
	"is_fatal" boolean DEFAULT false NOT NULL,
	"counting_mode" "counting_mode" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deadlines_id_tenant_id_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
ALTER TABLE "deadlines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deadline_tags" ADD CONSTRAINT "deadline_tags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_tags" ADD CONSTRAINT "deadline_tags_deadline_id_tenant_id_deadlines_id_tenant_id_fk" FOREIGN KEY ("deadline_id","tenant_id") REFERENCES "public"."deadlines"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_tags" ADD CONSTRAINT "deadline_tags_tag_id_tenant_id_tags_id_tenant_id_fk" FOREIGN KEY ("tag_id","tenant_id") REFERENCES "public"."tags"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_matter_id_tenant_id_matters_id_tenant_id_fk" FOREIGN KEY ("matter_id","tenant_id") REFERENCES "public"."matters"("id","tenant_id") ON DELETE cascade ON UPDATE no action;