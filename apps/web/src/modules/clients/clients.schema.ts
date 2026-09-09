// packages/schema is the single source of truth for these shapes.
import type { ClientStatus } from "@legal-manager/schema";
export { createClientInputSchema, updateClientInputSchema, clientStatuses } from "@legal-manager/schema";
export type { CreateClientInput, UpdateClientInput, ClientStatus } from "@legal-manager/schema";

export interface Client {
  id: string;
  status: ClientStatus;
  name: string;
  cpf: string | null;
  cnpj: string | null;
  rg: string | null;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  maritalStatus: string | null;
  profession: string | null;
  opposingParty: string | null;
  powerOfAttorney: string | null;
  observations: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListClientsFilter {
  status?: ClientStatus;
  search?: string;
}
