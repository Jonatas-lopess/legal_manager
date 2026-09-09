import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "advogado", "secretario"]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// `id` mirrors `auth.users.id` (== `auth.uid()`) — never a separately
// generated key, or `current_tenant_id()` (ADR-0005) can't resolve it.
// The FK to `auth.users(id)` is added in a hand-written migration alongside
// this one: `auth.*` is Supabase-managed (GoTrue), not part of this schema,
// so drizzle-kit must never see it as a table to generate/diff.
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  role: userRoleEnum("role").notNull().default("advogado"),
  name: text("name"),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const clientStatusEnum = pgEnum("client_status", ["ativo", "inativo"]);

// Ported from office_manager's clientsTable (PLANNING §2), minus the
// accounting-specific fields that don't belong to a law office's client
// model (mei_type/nirf/cib/incra/estadual_inscription/gov_password/
// payment_source) — plus the juridical fields ADR/PLANNING §4 adds
// (rg/address/marital_status/profession/opposing_party/power_of_attorney).
export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    status: clientStatusEnum("status").notNull().default("ativo"),
    name: text("name").notNull(),
    cpf: text("cpf"),
    cnpj: text("cnpj"),
    rg: text("rg"),
    // Calendar date, not an instant — a timestamptz would risk shifting to
    // the adjacent day under a timezone/DST conversion.
    birthDate: date("birth_date"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    maritalStatus: text("marital_status"),
    profession: text("profession"),
    opposingParty: text("opposing_party"),
    powerOfAttorney: text("power_of_attorney"),
    observations: text("observations"),
    // LGPD retention (§8): physical delete blocked below retentionUntil (a
    // hand-written migration, not expressible as a drizzle check) — soft
    // delete via deletedAt is a plain, ungated update.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    retentionUntil: timestamp("retention_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Lets matters carry a composite FK to its client, so a matter can never
    // reference another tenant's client (matches matters/tags below).
    unique("clients_id_tenant_id_unique").on(table.id, table.tenantId),
  ],
).enableRLS();

// Per-tenant catalog (replaces office_manager's hardcoded serviceTypesArray,
// PLANNING §4) — each escritório defines its own service types.
export const matterCatalogItems = pgTable(
  "matter_catalog_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("matter_catalog_items_id_tenant_id_unique").on(table.id, table.tenantId),
  ],
).enableRLS();

export const matterStatusEnum = pgEnum("matter_status", [
  "rascunho",
  "em_andamento",
  "concluido",
  "arquivado",
]);

export const matters = pgTable(
  "matters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // Nullable only in `rascunho` (ADR-0004) — enforced below, not just here.
    // Composite FKs below (against clients/matter_catalog_items'
    // unique(id, tenant_id)) instead of a plain single-column reference —
    // otherwise a matter could reference another tenant's client/catalog
    // item as long as *some* row with that id exists anywhere.
    clientId: uuid("client_id"),
    matterCatalogItemId: uuid("matter_catalog_item_id"),
    status: matterStatusEnum("status").notNull().default("rascunho"),
    // Jurisdiction lives on the matter, never the client (ADR-0002) — a
    // client can have matters in different comarcas.
    uf: text("uf").notNull(),
    comarca: text("comarca"),
    municipio: text("municipio"),
    description: text("description"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    retentionUntil: timestamp("retention_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "matters_rascunho_or_client_and_catalog_set",
      sql`${table.status} = 'rascunho' OR (${table.clientId} IS NOT NULL AND ${table.matterCatalogItemId} IS NOT NULL)`,
    ),
    check("matters_uf_is_two_letters", sql`char_length(${table.uf}) = 2`),
    // Lets matter_tags carry its own tenant_id while a composite FK (added
    // in the RLS migration) guarantees it can't drift from the matter's
    // real tenant.
    unique("matters_id_tenant_id_unique").on(table.id, table.tenantId),
    // Composite FKs (MATCH SIMPLE — trivially satisfied while clientId/
    // matterCatalogItemId is null, i.e. in rascunho) so a matter can only
    // ever reference its own tenant's client/catalog item.
    foreignKey({
      columns: [table.clientId, table.tenantId],
      foreignColumns: [clients.id, clients.tenantId],
    }),
    foreignKey({
      columns: [table.matterCatalogItemId, table.tenantId],
      foreignColumns: [matterCatalogItems.id, matterCatalogItems.tenantId],
    }),
  ],
).enableRLS();

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#6366f1"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("tags_id_tenant_id_unique").on(table.id, table.tenantId)],
).enableRLS();

export const matterTags = pgTable(
  "matter_tags",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    matterId: uuid("matter_id").notNull(),
    tagId: uuid("tag_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.matterId, table.tagId] }),
    // Composite FKs (against the unique(id, tenant_id) on matters/tags) so
    // this row's tenant_id can never disagree with the matter's or tag's
    // actual tenant — RLS isolation can't be spoofed via a mismatched value.
    foreignKey({
      columns: [table.matterId, table.tenantId],
      foreignColumns: [matters.id, matters.tenantId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tagId, table.tenantId],
      foreignColumns: [tags.id, tags.tenantId],
    }).onDelete("cascade"),
  ],
).enableRLS();

export const countingModeEnum = pgEnum("counting_mode", ["dias_uteis", "dias_corridos"]);

export const deadlineStatusEnum = pgEnum("deadline_status", ["pendente", "cumprido"]);

// matter_id/is_fatal/counting_mode are the fields the counting engine reads
// directly (ADR-0003, postgres-schema-rls/03). start_date/description/
// status/due_date are deadlines-engine-alerts/01's addendum — due_date is
// written only by deadlines.service.ts's computeDueDate, never a raw
// client-editable form field (see that spec's Implementation Decisions).
export const deadlines = pgTable(
  "deadlines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    matterId: uuid("matter_id").notNull(),
    isFatal: boolean("is_fatal").notNull().default(false),
    countingMode: countingModeEnum("counting_mode").notNull(),
    // The deadline's actual legal count (e.g. "15 dias úteis para
    // contestação") — a gap ticket 02 found: nothing else on this table (or
    // anywhere in the spec) carries the number computeDueDate needs. Added
    // as a follow-up (deadlines-engine-alerts/02's Comments) rather than
    // silently reinterpreting the spec.
    days: integer("days").notNull(),
    // Calendar date, not an instant — same reasoning as clients.birthDate.
    startDate: date("start_date").notNull(),
    description: text("description").notNull(),
    status: deadlineStatusEnum("status").notNull().default("pendente"),
    dueDate: date("due_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("deadlines_days_positive", sql`${table.days} > 0`),
    unique("deadlines_id_tenant_id_unique").on(table.id, table.tenantId),
    // Composite FK (against matters' unique(id, tenant_id)) — this row's
    // tenant_id can never disagree with its matter's actual tenant.
    foreignKey({
      columns: [table.matterId, table.tenantId],
      foreignColumns: [matters.id, matters.tenantId],
    }).onDelete("cascade"),
  ],
).enableRLS();

// Extends the tags/matter_tags pattern to deadlines (ADR-0003) — freeform,
// cosmetic labeling only, never read by the counting engine.
export const deadlineTags = pgTable(
  "deadline_tags",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    deadlineId: uuid("deadline_id").notNull(),
    tagId: uuid("tag_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.deadlineId, table.tagId] }),
    foreignKey({
      columns: [table.deadlineId, table.tenantId],
      foreignColumns: [deadlines.id, deadlines.tenantId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tagId, table.tenantId],
      foreignColumns: [tags.id, tags.tenantId],
    }).onDelete("cascade"),
  ],
).enableRLS();

// Global reference data (no tenant_id) — synced from FeriadosAPI on a
// schedule (deadlines-engine-alerts spec) so the counting engine never
// makes a live network call. Readable by any authenticated user; writable
// only by the sync Edge Function's service-role key (RLS migration).
export const civilHolidays = pgTable(
  "civil_holidays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull(),
    // Null means national (applies to every uf) — see the unique constraint
    // below, which must treat two null-uf rows on the same date as a
    // conflict for the sync job's upsert-on-(date,uf) to dedup correctly.
    uf: text("uf"),
    name: text("name").notNull(),
  },
  (table) => [
    // Plain `unique()` treats NULLs as distinct by default, which would let
    // every national (uf IS NULL) holiday for a given date insert as a
    // "new" row forever — `.nullsNotDistinct()` (Postgres 15+ `UNIQUE NULLS
    // NOT DISTINCT`, available per supabase/config.toml major_version = 17)
    // makes two null-uf rows on the same date collide like any other dup.
    unique("civil_holidays_date_uf_unique").on(table.date, table.uf).nullsNotDistinct(),
  ],
).enableRLS();

// Global reference data (no tenant_id), national-only for MVP (PLANNING §4
// — no uf/comarca column). Manually curated (seed script/SQL), no in-app
// editor this round. Same read-all/write-none-to-clients access shape as
// civil_holidays.
export const forensicHolidays = pgTable("forensic_holidays", {
  id: uuid("id").primaryKey().defaultRandom(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  description: text("description").notNull(),
  sourceYear: integer("source_year").notNull(),
}).enableRLS();

export const notificationChannelEnum = pgEnum("notification_channel", ["email", "in_app"]);

export const notificationStatusEnum = pgEnum("notification_status", [
  "pending",
  "sent",
  "failed",
]);

// The channel-agnostic notification model PLANNING §5 asks to model now
// ("hoje: e-mail/in-app; depois: WhatsApp") — deadline alerts are its first
// real consumer, but category/deadline_id are generic enough to admit other
// notification types later without a schema change. Only the alerts Edge
// Function's service-role key writes rows (RLS migration) — same lockdown
// pattern as `users`.
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: notificationChannelEnum("channel").notNull(),
    category: text("category").notNull(),
    // Nullable — null admits future non-deadline notification types. A
    // composite FK (MATCH SIMPLE, trivially satisfied when null — same
    // reasoning as matters.clientId above) still guarantees a non-null
    // value can never point at another tenant's deadline.
    deadlineId: uuid("deadline_id"),
    threshold: text("threshold"),
    payload: jsonb("payload").notNull(),
    status: notificationStatusEnum("status").notNull().default("pending"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.deadlineId, table.tenantId],
      foreignColumns: [deadlines.id, deadlines.tenantId],
    }).onDelete("cascade"),
    // Dedup mechanism for the alerts job (story 28): a rerun/overlap that
    // tries to insert the same (deadline, threshold, channel, recipient)
    // again is a no-op, not a duplicate e-mail. Partial (deadline_id IS NOT
    // NULL) so future non-deadline notifications (deadline_id null) never
    // collide.
    //
    // deadlines-engine-alerts/05 addendum: ticket 01's original index (this
    // comment previously described it as (deadline_id, threshold, channel)
    // only, no recipient_user_id) silently capped each (deadline, threshold,
    // channel) at exactly one row system-wide — fine for a single-recipient
    // fixture, but wrong once "Alert recipients" (spec's Implementation
    // Decisions) fans one alert out to every user in the deadline's tenant:
    // the second and third recipient's rows would hit this same conflict and
    // get silently dropped by `ON CONFLICT ... DO NOTHING`, so only one
    // tenant member would ever actually get notified. recipientUserId is
    // added to the key so dedup is scoped per-recipient (still exactly-once
    // per recipient on a rerun/overlap) rather than per-deadline overall.
    // Same "found ticket 01 missed a column/constraint, fixed via a small
    // follow-up migration in this ticket" precedent as
    // 20260909163303_deadlines-days-column.sql (ticket 02's `days` column).
    uniqueIndex("notifications_deadline_threshold_channel_unique")
      .on(table.deadlineId, table.threshold, table.channel, table.recipientUserId)
      .where(sql`${table.deadlineId} is not null`),
  ],
).enableRLS();

export const paymentStatusEnum = pgEnum("payment_status", ["pago", "pendente"]);

// Simplified MVP financial tracking (PLANNING §4): fixed value + status,
// no hourly timesheet/success-fee/split.
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    matterId: uuid("matter_id").notNull(),
    value: numeric("value", { precision: 12, scale: 2 }).notNull(),
    status: paymentStatusEnum("status").notNull().default("pendente"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.matterId, table.tenantId],
      foreignColumns: [matters.id, matters.tenantId],
    }).onDelete("cascade"),
  ],
).enableRLS();

export const auditActionEnum = pgEnum("audit_action", ["insert", "update", "delete"]);

// Populated only by the trigger in the accompanying RLS migration (never a
// direct client insert) — every write to clients/matters/payments, for
// LGPD/sigilo-profissional accountability.
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Nullable + SET NULL, not CASCADE: the audit trail is meant to outlive
  // the tenant it recorded, same reasoning as userId below — an orphaned
  // row keeps its action/entity/timestamp even once unattributable.
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  // Preserves the audit trail even if the acting user is later removed.
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: auditActionEnum("action").notNull(),
  entity: text("entity").notNull(),
  entityId: uuid("entity_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
