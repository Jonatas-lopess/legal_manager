// Public API of the `clients` module (PLANNING §6) — the rest of the app
// (and every other module) reaches client CRUD only through this file,
// never clients.service.ts/clients.repository.ts directly (enforced by
// eslint-plugin-boundaries, see eslint.config.ts).
export { createClient, updateClient, softDeleteClient, getClient, listClients } from "./clients.service";
export { clientStatuses } from "./clients.schema";
export type { Client, ClientStatus, CreateClientInput, UpdateClientInput, ListClientsFilter } from "./clients.schema";
