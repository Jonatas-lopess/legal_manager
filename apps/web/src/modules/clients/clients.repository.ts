import type { z } from "zod";
import { supabase } from "@/lib/supabase";
import type { createClientInputSchema, updateClientInputSchema } from "./clients.schema";

// The already-`.parse()`d shape (service.ts's job, never this file's) —
// every field present, `.transform()`'d to `string | null`. Distinct from
// clients.schema.ts's `CreateClientInput`/`UpdateClientInput`, which are the
// permissive pre-parse shape callers pass in.
type ParsedCreateClient = z.output<typeof createClientInputSchema>;
type ParsedClientPatch = z.output<typeof updateClientInputSchema>;

interface ClientRow {
  id: string;
  status: string;
  name: string;
  cpf: string | null;
  cnpj: string | null;
  rg: string | null;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  marital_status: string | null;
  profession: string | null;
  opposing_party: string | null;
  power_of_attorney: string | null;
  observations: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS =
  "id, status, name, cpf, cnpj, rg, birth_date, phone, email, address, marital_status, profession, opposing_party, power_of_attorney, observations, deleted_at, created_at, updated_at";

export async function insertClient(tenantId: string, input: ParsedCreateClient) {
  return supabase
    .from("clients")
    .insert({
      tenant_id: tenantId,
      status: input.status,
      name: input.name,
      cpf: input.cpf,
      cnpj: input.cnpj,
      rg: input.rg,
      birth_date: input.birthDate,
      phone: input.phone,
      email: input.email,
      address: input.address,
      marital_status: input.maritalStatus,
      profession: input.profession,
      opposing_party: input.opposingParty,
      power_of_attorney: input.powerOfAttorney,
      observations: input.observations,
    })
    .select(SELECT_COLUMNS)
    .single<ClientRow>();
}

/** Only the fields actually present in `input` are sent — `.partial()` leaves
 * the rest `undefined`, and undefined keys are dropped before the request so
 * an omitted field is left untouched rather than nulled out. */
export async function updateClient(id: string, input: ParsedClientPatch) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.status !== undefined) patch.status = input.status;
  if (input.name !== undefined) patch.name = input.name;
  if (input.cpf !== undefined) patch.cpf = input.cpf;
  if (input.cnpj !== undefined) patch.cnpj = input.cnpj;
  if (input.rg !== undefined) patch.rg = input.rg;
  if (input.birthDate !== undefined) patch.birth_date = input.birthDate;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.email !== undefined) patch.email = input.email;
  if (input.address !== undefined) patch.address = input.address;
  if (input.maritalStatus !== undefined) patch.marital_status = input.maritalStatus;
  if (input.profession !== undefined) patch.profession = input.profession;
  if (input.opposingParty !== undefined) patch.opposing_party = input.opposingParty;
  if (input.powerOfAttorney !== undefined) patch.power_of_attorney = input.powerOfAttorney;
  if (input.observations !== undefined) patch.observations = input.observations;

  return supabase.from("clients").update(patch).eq("id", id).select(SELECT_COLUMNS).single<ClientRow>();
}

export async function softDeleteClient(id: string) {
  return supabase
    .from("clients")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single<ClientRow>();
}

/** No `deleted_at` filter — a soft-deleted client must still resolve by id
 * (e.g. from an existing matter's reference). */
export async function fetchClientById(id: string) {
  return supabase.from("clients").select(SELECT_COLUMNS).eq("id", id).maybeSingle<ClientRow>();
}

export interface ListClientsParams {
  status?: string;
  search?: string;
}

// PostgREST's `.or()` filter string uses `,()` as its own grammar — a search
// term containing them (a name like "Silva, João" or "Empresa (Filial)")
// would otherwise split into bogus extra conditions instead of matching
// literally. Wrapping the value in double quotes escapes it; `\`/`"` inside
// still need their own escape per PostgREST's quoting rules.
function quoteFilterValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export async function listClients({ status, search }: ListClientsParams) {
  let query = supabase.from("clients").select(SELECT_COLUMNS).is("deleted_at", null).order("name", { ascending: true });

  if (status) query = query.eq("status", status);
  if (search) {
    const term = quoteFilterValue(`%${search}%`);
    query = query.or(`name.ilike.${term},cpf.ilike.${term},cnpj.ilike.${term}`);
  }

  return query.returns<ClientRow[]>();
}

export type { ClientRow };
