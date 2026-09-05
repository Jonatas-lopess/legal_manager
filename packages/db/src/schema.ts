import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
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

// Only the fields the future counting engine reads directly (ADR-0003) —
// start_date/due_date/description/status are the deadlines-engine-alerts
// spec's job, not this one's.
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
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
