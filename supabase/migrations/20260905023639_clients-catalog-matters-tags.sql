CREATE TYPE "public"."client_status" AS ENUM('ativo', 'inativo');--> statement-breakpoint
CREATE TYPE "public"."matter_status" AS ENUM('rascunho', 'em_andamento', 'concluido', 'arquivado');--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" "client_status" DEFAULT 'ativo' NOT NULL,
	"name" text NOT NULL,
	"cpf" text,
	"cnpj" text,
	"rg" text,
	"birth_date" date,
	"phone" text,
	"email" text,
	"address" text,
	"marital_status" text,
	"profession" text,
	"opposing_party" text,
	"power_of_attorney" text,
	"observations" text,
	"deleted_at" timestamp with time zone,
	"retention_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_id_tenant_id_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "matter_catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matter_catalog_items_id_tenant_id_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
ALTER TABLE "matter_catalog_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "matter_tags" (
	"tenant_id" uuid NOT NULL,
	"matter_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "matter_tags_matter_id_tag_id_pk" PRIMARY KEY("matter_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "matter_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "matters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid,
	"matter_catalog_item_id" uuid,
	"status" "matter_status" DEFAULT 'rascunho' NOT NULL,
	"uf" text NOT NULL,
	"comarca" text,
	"municipio" text,
	"description" text,
	"deleted_at" timestamp with time zone,
	"retention_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matters_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "matters_rascunho_or_client_and_catalog_set" CHECK ("matters"."status" = 'rascunho' OR ("matters"."client_id" IS NOT NULL AND "matters"."matter_catalog_item_id" IS NOT NULL)),
	CONSTRAINT "matters_uf_is_two_letters" CHECK (char_length("matters"."uf") = 2)
);
--> statement-breakpoint
ALTER TABLE "matters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_id_tenant_id_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_catalog_items" ADD CONSTRAINT "matter_catalog_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_tags" ADD CONSTRAINT "matter_tags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_tags" ADD CONSTRAINT "matter_tags_matter_id_tenant_id_matters_id_tenant_id_fk" FOREIGN KEY ("matter_id","tenant_id") REFERENCES "public"."matters"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_tags" ADD CONSTRAINT "matter_tags_tag_id_tenant_id_tags_id_tenant_id_fk" FOREIGN KEY ("tag_id","tenant_id") REFERENCES "public"."tags"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matters" ADD CONSTRAINT "matters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matters" ADD CONSTRAINT "matters_client_id_tenant_id_clients_id_tenant_id_fk" FOREIGN KEY ("client_id","tenant_id") REFERENCES "public"."clients"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matters" ADD CONSTRAINT "matters_matter_catalog_item_id_tenant_id_matter_catalog_items_id_tenant_id_fk" FOREIGN KEY ("matter_catalog_item_id","tenant_id") REFERENCES "public"."matter_catalog_items"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;