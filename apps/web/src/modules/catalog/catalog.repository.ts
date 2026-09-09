import type { z } from "zod";
import { supabase } from "@/lib/supabase";
import type { createCatalogItemInputSchema, updateCatalogItemInputSchema } from "./catalog.schema";

// The already-`.parse()`d shape (service.ts's job, never this file's).
type ParsedCreateCatalogItem = z.output<typeof createCatalogItemInputSchema>;
type ParsedCatalogItemPatch = z.output<typeof updateCatalogItemInputSchema>;

interface CatalogItemRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = "id, name, created_at, updated_at";

export async function insertCatalogItem(tenantId: string, input: ParsedCreateCatalogItem) {
  return supabase
    .from("matter_catalog_items")
    .insert({ tenant_id: tenantId, name: input.name })
    .select(SELECT_COLUMNS)
    .single<CatalogItemRow>();
}

export async function updateCatalogItem(id: string, input: ParsedCatalogItemPatch) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;

  return supabase.from("matter_catalog_items").update(patch).eq("id", id).select(SELECT_COLUMNS).single<CatalogItemRow>();
}

export async function fetchCatalogItemById(id: string) {
  return supabase.from("matter_catalog_items").select(SELECT_COLUMNS).eq("id", id).maybeSingle<CatalogItemRow>();
}

export async function listCatalogItems() {
  return supabase.from("matter_catalog_items").select(SELECT_COLUMNS).order("name", { ascending: true }).returns<CatalogItemRow[]>();
}

// No cross-context `matters.repository.ts` call (PLANNING §6 forbids it) —
// a direct count against `matters` is the spec's explicitly sanctioned
// alternative (clients-catalog-matters-crud/spec.md, Implementation
// Decisions) since the `matters` module doesn't exist yet either way.
// "Soft-deleted or not" per the spec — no `deleted_at` filter here.
export async function countReferencingMatters(catalogItemId: string) {
  return supabase.from("matters").select("id", { count: "exact", head: true }).eq("matter_catalog_item_id", catalogItemId);
}

export async function deleteCatalogItem(id: string) {
  return supabase.from("matter_catalog_items").delete().eq("id", id);
}

export type { CatalogItemRow };
