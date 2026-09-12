// Regression guard for ticket 03 (Prazos page) — updated for
// ui-shell-clientes-casos-config/03's bucketing-helper extraction (spec.md
// fidelity check point 9): the vencido/hoje/próximos grouping itself moved
// into `deadlines.service.ts`'s `getPrazoBuckets` (re-exported via
// `deadlines.controller.ts`) and keeps its own dedicated test coverage over
// there (see `deadlines/test/deadlines.prazoBuckets.test.ts`, moved from
// this file, plus a new case for the `matterId` param). What's left here is
// reports.service.ts's own remaining responsibility: delegating to
// `getPrazoBuckets` with no `matterId` (every pendente deadline in the
// tenant — the matter-scoped Prazos card is the other caller, see that
// module's tests) and resolving each row's `matterLabel` against
// matters/clients/catalog. So every collaborator is mocked (fully DB-free,
// no real Postgres/Supabase) and the assertions are about *delegation*
// (which mock got called, with what) and the matterLabel-resolution logic
// — never about the vencido/hoje/próximos comparison itself. Mocking style
// mirrors DeadlineDialog.test.tsx (`vi.mock(...)` + `vi.importActual` +
// `vi.mocked`).

import { describe, expect, it, vi } from "vitest";

vi.mock("../../deadlines/deadlines.controller", async () => {
  const actual = await vi.importActual<typeof import("../../deadlines/deadlines.controller")>(
    "../../deadlines/deadlines.controller",
  );
  return { ...actual, getPrazoBuckets: vi.fn() };
});
vi.mock("../../matters/matters.controller", async () => {
  const actual = await vi.importActual<typeof import("../../matters/matters.controller")>(
    "../../matters/matters.controller",
  );
  return { ...actual, listMatters: vi.fn() };
});
vi.mock("../../clients/clients.controller", async () => {
  const actual = await vi.importActual<typeof import("../../clients/clients.controller")>(
    "../../clients/clients.controller",
  );
  return { ...actual, listClients: vi.fn() };
});
vi.mock("../../catalog/catalog.controller", async () => {
  const actual = await vi.importActual<typeof import("../../catalog/catalog.controller")>(
    "../../catalog/catalog.controller",
  );
  return { ...actual, listCatalogItems: vi.fn() };
});

import { getPrazosCriticos } from "../reports.service";
import * as deadlinesController from "../../deadlines/deadlines.controller";
import * as mattersController from "../../matters/matters.controller";
import * as clientsController from "../../clients/clients.controller";
import * as catalogController from "../../catalog/catalog.controller";
import type { PrazoBucketDeadline } from "../../deadlines/deadlines.controller";
import type { Matter } from "../../matters/matters.controller";
import type { Client } from "../../clients/clients.controller";
import type { CatalogItem } from "../../catalog/catalog.controller";

const getPrazoBucketsMock = vi.mocked(deadlinesController.getPrazoBuckets);
const listMattersMock = vi.mocked(mattersController.listMatters);
const listClientsMock = vi.mocked(clientsController.listClients);
const listCatalogItemsMock = vi.mocked(catalogController.listCatalogItems);

function makeBucketDeadline(overrides: Partial<PrazoBucketDeadline>): PrazoBucketDeadline {
  return {
    id: "deadline-id",
    matterId: "matter-id",
    isFatal: false,
    countingMode: "dias_corridos",
    days: 10,
    startDate: "2026-01-01",
    description: "Descrição",
    status: "pendente",
    dueDate: "2026-01-10",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    highlight: "vence_em_breve",
    ...overrides,
  };
}

const matterComClienteECatalogo: Matter = {
  id: "matter-1",
  clientId: "client-1",
  matterCatalogItemId: "catalog-1",
  status: "em_andamento",
  uf: "SP",
  comarca: null,
  municipio: null,
  description: "Processo com cliente",
  numeroCnj: null,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const matterSemClienteOuCatalogo: Matter = {
  id: "matter-2",
  clientId: null,
  matterCatalogItemId: null,
  status: "rascunho",
  uf: "RJ",
  comarca: null,
  municipio: null,
  description: "Rascunho",
  numeroCnj: null,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const client: Client = {
  id: "client-1",
  status: "ativo",
  name: "Cliente Um",
  cpf: null,
  cnpj: null,
  rg: null,
  birthDate: null,
  phone: null,
  email: null,
  address: null,
  maritalStatus: null,
  profession: null,
  opposingParty: null,
  powerOfAttorney: null,
  observations: null,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const catalogItem: CatalogItem = {
  id: "catalog-1",
  name: "Item Um",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("getPrazosCriticos", () => {
  it("delegates bucketing to deadlines.controller's getPrazoBuckets with no matterId (every pendente deadline in the tenant) and resolves each row's matterLabel", async () => {
    const vencidoDeadline = makeBucketDeadline({
      id: "d-vencido",
      matterId: matterComClienteECatalogo.id,
      dueDate: "2026-05-01",
      highlight: "vencido",
    });
    const hojeDeadline = makeBucketDeadline({
      id: "d-hoje",
      matterId: matterSemClienteOuCatalogo.id,
      dueDate: "2026-05-10",
      isFatal: true,
      highlight: "vence_em_breve",
    });
    const proximoDeadline = makeBucketDeadline({
      id: "d-proximo",
      matterId: "matter-desconhecido",
      dueDate: "2026-05-12",
      highlight: "vence_em_breve",
    });

    getPrazoBucketsMock.mockResolvedValue({
      count: 3,
      groups: { vencido: [vencidoDeadline], hoje: [hojeDeadline], proximos: [proximoDeadline] },
    });
    listMattersMock.mockResolvedValue([matterComClienteECatalogo, matterSemClienteOuCatalogo]);
    listClientsMock.mockResolvedValue([client]);
    listCatalogItemsMock.mockResolvedValue([catalogItem]);

    const result = await getPrazosCriticos();

    // Delegation, not reimplementation — no matterId, this is the
    // tenant-wide aggregate, not the matter-scoped Prazos card.
    expect(getPrazoBucketsMock).toHaveBeenCalledWith();

    expect(result.count).toBe(3);

    expect(result.groups.vencido).toHaveLength(1);
    expect(result.groups.vencido[0]).toMatchObject({
      id: "d-vencido",
      matterLabel: "Cliente Um — Item Um",
      description: "Descrição",
      dueDate: "2026-05-01",
      highlight: "vencido",
      isFatal: false,
    });

    expect(result.groups.hoje).toHaveLength(1);
    expect(result.groups.hoje[0]).toMatchObject({
      id: "d-hoje",
      matterLabel: "RJ — Rascunho",
      highlight: "vence_em_breve",
      isFatal: true,
    });

    expect(result.groups.proximos).toHaveLength(1);
    expect(result.groups.proximos[0]).toMatchObject({
      id: "d-proximo",
      matterLabel: "—",
      highlight: "vence_em_breve",
      isFatal: false,
    });
  });

  it("returns a zero headline and empty groups for a zero-data tenant", async () => {
    getPrazoBucketsMock.mockResolvedValue({ count: 0, groups: { vencido: [], hoje: [], proximos: [] } });
    listMattersMock.mockResolvedValue([]);
    listClientsMock.mockResolvedValue([]);
    listCatalogItemsMock.mockResolvedValue([]);

    const result = await getPrazosCriticos();

    expect(result).toEqual({ count: 0, groups: { vencido: [], hoje: [], proximos: [] } });
  });
});
