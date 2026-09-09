import { createMatterInputSchema, updateMatterInputSchema } from "./matters.schema";
import type { Matter, CreateMatterInput, ListMattersFilter, MatterStatus, UpdateMatterInput } from "./matters.schema";
import * as repo from "./matters.repository";
import type { MatterRow } from "./matters.repository";
import { getCurrentUser } from "../tenants/tenants.controller";

function toMatter(row: MatterRow): Matter {
  return {
    id: row.id,
    clientId: row.client_id,
    matterCatalogItemId: row.matter_catalog_item_id,
    status: row.status as Matter["status"],
    uf: row.uf,
    comarca: row.comarca,
    municipio: row.municipio,
    description: row.description,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Mirrors the DB's `matters_rascunho_or_client_and_catalog_set` CHECK
 * (ADR-0004) so callers get a clean domain error instead of a raw Postgres
 * constraint violation — the DB check remains the actual source of truth,
 * this is a UX pre-check that runs before every write that could violate it. */
function assertRascunhoLifecycleInvariant(
  status: MatterStatus,
  clientId: string | null,
  matterCatalogItemId: string | null,
): void {
  if (status !== "rascunho" && (clientId === null || matterCatalogItemId === null)) {
    throw new Error(
      "Para sair de rascunho, o processo precisa ter cliente e item do catálogo definidos.",
    );
  }
}

/** Insert carries `tenant_id` explicitly — RLS's `with check` compares it
 * against `current_tenant_id()` but PostgREST never fills it in for us. */
export async function createMatter(input: CreateMatterInput): Promise<Matter> {
  const parsed = createMatterInputSchema.parse(input);
  assertRascunhoLifecycleInvariant(parsed.status, parsed.clientId, parsed.matterCatalogItemId);

  const user = await getCurrentUser();
  if (!user) throw new Error("Não autenticado.");

  const { data, error } = await repo.insertMatter(user.tenantId, parsed);
  if (error || !data) throw error ?? new Error("Falha ao criar processo.");
  return toMatter(data);
}

/** Checks the resulting status/client/catalog-item combination (patch
 * fields win over the row's current values) whenever the patch touches any
 * of those three — covers both "promote status without a ref" and "clear a
 * ref while status stays non-rascunho". Fields untouched by the patch never
 * trigger this (and the DB check already holds for the existing row). */
export async function updateMatter(id: string, input: UpdateMatterInput): Promise<Matter> {
  const parsed = updateMatterInputSchema.parse(input);

  if (parsed.status !== undefined || parsed.clientId !== undefined || parsed.matterCatalogItemId !== undefined) {
    const { data: current, error: fetchError } = await repo.fetchMatterById(id);
    if (fetchError) throw fetchError;
    if (!current) throw new Error("Processo não encontrado.");

    const resultingStatus = parsed.status ?? (current.status as MatterStatus);
    const resultingClientId = parsed.clientId !== undefined ? parsed.clientId : current.client_id;
    const resultingCatalogItemId =
      parsed.matterCatalogItemId !== undefined ? parsed.matterCatalogItemId : current.matter_catalog_item_id;

    assertRascunhoLifecycleInvariant(resultingStatus, resultingClientId, resultingCatalogItemId);
  }

  const { data, error } = await repo.updateMatter(id, parsed);
  if (error || !data) throw error ?? new Error("Falha ao atualizar processo.");
  return toMatter(data);
}

export async function softDeleteMatter(id: string): Promise<Matter> {
  const { data, error } = await repo.softDeleteMatter(id);
  if (error || !data) throw error ?? new Error("Falha ao excluir processo.");
  return toMatter(data);
}

/** Resolves by id regardless of soft-delete state — see matters.repository. */
export async function getMatter(id: string): Promise<Matter | null> {
  const { data, error } = await repo.fetchMatterById(id);
  if (error) throw error;
  return data ? toMatter(data) : null;
}

/** RLS scopes this to the caller's own tenant; default excludes soft-deleted
 * rows — see matters.repository. */
export async function listMatters(filter: ListMattersFilter = {}): Promise<Matter[]> {
  const { data, error } = await repo.listMatters(filter);
  if (error) throw error;
  return (data ?? []).map(toMatter);
}
