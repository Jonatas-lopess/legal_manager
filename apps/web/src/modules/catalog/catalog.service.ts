import { createCatalogItemInputSchema, updateCatalogItemInputSchema } from "./catalog.schema";
import type { CatalogItem, CreateCatalogItemInput, UpdateCatalogItemInput } from "./catalog.schema";
import * as repo from "./catalog.repository";
import type { CatalogItemRow } from "./catalog.repository";
import { getCurrentUser } from "../tenants/tenants.controller";

function toCatalogItem(row: CatalogItemRow): CatalogItem {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Insert carries `tenant_id` explicitly — RLS's `with check` compares it
 * against `current_tenant_id()` but PostgREST never fills it in for us. */
export async function createCatalogItem(input: CreateCatalogItemInput): Promise<CatalogItem> {
  const parsed = createCatalogItemInputSchema.parse(input);

  const user = await getCurrentUser();
  if (!user) throw new Error("Não autenticado.");

  const { data, error } = await repo.insertCatalogItem(user.tenantId, parsed);
  if (error || !data) throw error ?? new Error("Falha ao criar item do catálogo.");
  return toCatalogItem(data);
}

export async function updateCatalogItem(id: string, input: UpdateCatalogItemInput): Promise<CatalogItem> {
  const parsed = updateCatalogItemInputSchema.parse(input);

  const { data, error } = await repo.updateCatalogItem(id, parsed);
  if (error || !data) throw error ?? new Error("Falha ao atualizar item do catálogo.");
  return toCatalogItem(data);
}

export async function getCatalogItem(id: string): Promise<CatalogItem | null> {
  const { data, error } = await repo.fetchCatalogItemById(id);
  if (error) throw error;
  return data ? toCatalogItem(data) : null;
}

/** RLS scopes this to the caller's own tenant — see catalog.repository. */
export async function listCatalogItems(): Promise<CatalogItem[]> {
  const { data, error } = await repo.listCatalogItems();
  if (error) throw error;
  return (data ?? []).map(toCatalogItem);
}

/** Rejects (no row removed) when any matter — soft-deleted or not — still
 * references this item; rename is the non-destructive alternative. */
export async function deleteCatalogItem(id: string): Promise<void> {
  const { count, error: countError } = await repo.countReferencingMatters(id);
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    throw new Error("Não é possível excluir: item do catálogo está em uso por ao menos um processo.");
  }

  const { error } = await repo.deleteCatalogItem(id);
  if (error) throw error;
}
