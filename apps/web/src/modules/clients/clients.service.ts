import { createClientInputSchema, updateClientInputSchema } from "./clients.schema";
import type { Client, CreateClientInput, ListClientsFilter, UpdateClientInput } from "./clients.schema";
import * as repo from "./clients.repository";
import type { ClientRow } from "./clients.repository";
import { getCurrentUser } from "../tenants/tenants.controller";

function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    status: row.status as Client["status"],
    name: row.name,
    cpf: row.cpf,
    cnpj: row.cnpj,
    rg: row.rg,
    birthDate: row.birth_date,
    phone: row.phone,
    email: row.email,
    address: row.address,
    maritalStatus: row.marital_status,
    profession: row.profession,
    opposingParty: row.opposing_party,
    powerOfAttorney: row.power_of_attorney,
    observations: row.observations,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Insert carries `tenant_id` explicitly — RLS's `with check` compares it
 * against `current_tenant_id()` but PostgREST never fills it in for us. */
export async function createClient(input: CreateClientInput): Promise<Client> {
  const parsed = createClientInputSchema.parse(input);

  const user = await getCurrentUser();
  if (!user) throw new Error("Não autenticado.");

  const { data, error } = await repo.insertClient(user.tenantId, parsed);
  if (error || !data) throw error ?? new Error("Falha ao criar cliente.");
  return toClient(data);
}

export async function updateClient(id: string, input: UpdateClientInput): Promise<Client> {
  const parsed = updateClientInputSchema.parse(input);

  const { data, error } = await repo.updateClient(id, parsed);
  if (error || !data) throw error ?? new Error("Falha ao atualizar cliente.");
  return toClient(data);
}

export async function softDeleteClient(id: string): Promise<Client> {
  const { data, error } = await repo.softDeleteClient(id);
  if (error || !data) throw error ?? new Error("Falha ao excluir cliente.");
  return toClient(data);
}

/** Resolves by id regardless of soft-delete state — see clients.repository. */
export async function getClient(id: string): Promise<Client | null> {
  const { data, error } = await repo.fetchClientById(id);
  if (error) throw error;
  return data ? toClient(data) : null;
}

/** RLS scopes this to the caller's own tenant; default excludes soft-deleted
 * rows — see clients.repository. */
export async function listClients(filter: ListClientsFilter = {}): Promise<Client[]> {
  const { data, error } = await repo.listClients(filter);
  if (error) throw error;
  return (data ?? []).map(toClient);
}
