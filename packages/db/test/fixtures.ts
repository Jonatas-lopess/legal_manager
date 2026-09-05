import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

export type Role = "admin" | "advogado" | "secretario";

export async function createTenant(client: PoolClient, name: string) {
  const { rows } = await client.query<{ id: string }>(
    "insert into tenants (name) values ($1) returning id",
    [name],
  );
  return rows[0]!;
}

/** Also creates the `auth.users` stand-in row the `users` FK requires. */
export async function createUser(client: PoolClient, tenantId: string, role: Role) {
  const id = randomUUID();
  await client.query("insert into auth.users (id) values ($1)", [id]);
  await client.query("insert into users (id, tenant_id, role) values ($1, $2, $3)", [
    id,
    tenantId,
    role,
  ]);
  return { id, tenantId, role };
}

export async function createClient(
  client: PoolClient,
  tenantId: string,
  overrides: { retentionUntil?: Date | null; status?: "ativo" | "inativo" } = {},
) {
  const { rows } = await client.query<{ id: string }>(
    "insert into clients (tenant_id, name, status, retention_until) values ($1, $2, $3, $4) returning id",
    [tenantId, "Cliente Teste", overrides.status ?? "ativo", overrides.retentionUntil ?? null],
  );
  return { id: rows[0]!.id, tenantId };
}

export async function createMatterCatalogItem(client: PoolClient, tenantId: string, name = "Consultoria") {
  const { rows } = await client.query<{ id: string }>(
    "insert into matter_catalog_items (tenant_id, name) values ($1, $2) returning id",
    [tenantId, name],
  );
  return { id: rows[0]!.id, tenantId };
}

export async function createMatter(
  client: PoolClient,
  tenantId: string,
  overrides: {
    clientId?: string | null;
    matterCatalogItemId?: string | null;
    status?: "rascunho" | "em_andamento" | "concluido" | "arquivado";
    uf?: string;
    retentionUntil?: Date | null;
  } = {},
) {
  const { rows } = await client.query<{ id: string }>(
    `insert into matters (tenant_id, client_id, matter_catalog_item_id, status, uf, retention_until)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [
      tenantId,
      overrides.clientId ?? null,
      overrides.matterCatalogItemId ?? null,
      overrides.status ?? "rascunho",
      overrides.uf ?? "SP",
      overrides.retentionUntil ?? null,
    ],
  );
  return { id: rows[0]!.id, tenantId };
}

export async function createTag(client: PoolClient, tenantId: string, name = "Urgente") {
  const { rows } = await client.query<{ id: string }>(
    "insert into tags (tenant_id, name) values ($1, $2) returning id",
    [tenantId, name],
  );
  return { id: rows[0]!.id, tenantId };
}

export async function attachTag(client: PoolClient, tenantId: string, matterId: string, tagId: string) {
  await client.query("insert into matter_tags (tenant_id, matter_id, tag_id) values ($1, $2, $3)", [
    tenantId,
    matterId,
    tagId,
  ]);
}

export async function createDeadline(
  client: PoolClient,
  tenantId: string,
  matterId: string,
  overrides: { isFatal?: boolean; countingMode?: "dias_uteis" | "dias_corridos" } = {},
) {
  const { rows } = await client.query<{ id: string }>(
    "insert into deadlines (tenant_id, matter_id, is_fatal, counting_mode) values ($1, $2, $3, $4) returning id",
    [tenantId, matterId, overrides.isFatal ?? false, overrides.countingMode ?? "dias_uteis"],
  );
  return { id: rows[0]!.id, tenantId };
}

export async function createPayment(
  client: PoolClient,
  tenantId: string,
  matterId: string,
  overrides: { value?: string; status?: "pago" | "pendente" } = {},
) {
  const { rows } = await client.query<{ id: string }>(
    "insert into payments (tenant_id, matter_id, value, status) values ($1, $2, $3, $4) returning id",
    [tenantId, matterId, overrides.value ?? "100.00", overrides.status ?? "pendente"],
  );
  return { id: rows[0]!.id, tenantId };
}

export async function attachDeadlineTag(
  client: PoolClient,
  tenantId: string,
  deadlineId: string,
  tagId: string,
) {
  await client.query(
    "insert into deadline_tags (tenant_id, deadline_id, tag_id) values ($1, $2, $3)",
    [tenantId, deadlineId, tagId],
  );
}
