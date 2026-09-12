import type { z } from "zod";
import { supabase } from "@/lib/supabase";
import type { createMatterInputSchema, updateMatterInputSchema } from "./matters.schema";

// The already-`.parse()`d shape (service.ts's job, never this file's) —
// every field present, `.transform()`'d to its DB-ready form. Distinct from
// matters.schema.ts's `CreateMatterInput`/`UpdateMatterInput`, which are the
// permissive pre-parse shape callers pass in.
type ParsedCreateMatter = z.output<typeof createMatterInputSchema>;
type ParsedMatterPatch = z.output<typeof updateMatterInputSchema>;

interface MatterRow {
  id: string;
  client_id: string | null;
  matter_catalog_item_id: string | null;
  status: string;
  uf: string;
  comarca: string | null;
  municipio: string | null;
  description: string | null;
  numero_cnj: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS =
  "id, client_id, matter_catalog_item_id, status, uf, comarca, municipio, description, numero_cnj, deleted_at, created_at, updated_at";

export async function insertMatter(tenantId: string, input: ParsedCreateMatter) {
  return supabase
    .from("matters")
    .insert({
      tenant_id: tenantId,
      client_id: input.clientId,
      matter_catalog_item_id: input.matterCatalogItemId,
      status: input.status,
      uf: input.uf,
      comarca: input.comarca,
      municipio: input.municipio,
      description: input.description,
      numero_cnj: input.numeroCnj,
    })
    .select(SELECT_COLUMNS)
    .single<MatterRow>();
}

/** Only the fields actually present in `input` are sent — `.partial()` leaves
 * the rest `undefined`, and undefined keys are dropped before the request so
 * an omitted field is left untouched rather than nulled out. */
export async function updateMatter(id: string, input: ParsedMatterPatch) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.clientId !== undefined) patch.client_id = input.clientId;
  if (input.matterCatalogItemId !== undefined) patch.matter_catalog_item_id = input.matterCatalogItemId;
  if (input.status !== undefined) patch.status = input.status;
  if (input.uf !== undefined) patch.uf = input.uf;
  if (input.comarca !== undefined) patch.comarca = input.comarca;
  if (input.municipio !== undefined) patch.municipio = input.municipio;
  if (input.description !== undefined) patch.description = input.description;
  if (input.numeroCnj !== undefined) patch.numero_cnj = input.numeroCnj;

  return supabase.from("matters").update(patch).eq("id", id).select(SELECT_COLUMNS).single<MatterRow>();
}

export async function softDeleteMatter(id: string) {
  return supabase
    .from("matters")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single<MatterRow>();
}

/** No `deleted_at` filter — a soft-deleted matter must still resolve by id
 * (e.g. from a deep link or another module's reference). */
export async function fetchMatterById(id: string) {
  return supabase.from("matters").select(SELECT_COLUMNS).eq("id", id).maybeSingle<MatterRow>();
}

export interface ListMattersParams {
  status?: string;
  clientId?: string;
  search?: string;
}

// PostgREST's `.or()` filter string uses `,()` as its own grammar — a search
// term containing them would otherwise split into bogus extra conditions
// instead of matching literally. Wrapping the value in double quotes escapes
// it; `\`/`"` inside still need their own escape per PostgREST's quoting
// rules. (Same helper as clients.repository.ts — kept local, not shared,
// matching that file's precedent of a self-contained repository.)
function quoteFilterValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export async function listMatters({ status, clientId, search }: ListMattersParams) {
  let query = supabase
    .from("matters")
    .select(SELECT_COLUMNS)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (clientId) query = query.eq("client_id", clientId);
  if (search) {
    const term = quoteFilterValue(`%${search}%`);
    query = query.or(
      `description.ilike.${term},uf.ilike.${term},comarca.ilike.${term},municipio.ilike.${term},numero_cnj.ilike.${term}`,
    );
  }

  return query.returns<MatterRow[]>();
}

export type { MatterRow };
