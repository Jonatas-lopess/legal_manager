// Regression guard for ticket 03 (Prazos page): spec.md's Testing Decisions
// are explicit that this computation gets "no new computation to test —
// assert it's calling deadlines.service.ts's existing overdue/vence-em-
// breve function rather than reimplementing the comparison." So every
// collaborator is mocked (fully DB-free, no real Postgres/Supabase) and the
// assertions are about *delegation* (which mock got called, with what) and
// the surrounding grouping/label logic — never about the vencido/vence-em-
// breve comparison itself, since that lives in deadlines.controller and is
// exercised by that module's own tests. Mocking style mirrors
// DeadlineDialog.test.tsx (`vi.mock(...)` + `vi.importActual` + `vi.mocked`).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../deadlines/deadlines.controller", async () => {
  const actual = await vi.importActual<typeof import("../../deadlines/deadlines.controller")>(
    "../../deadlines/deadlines.controller",
  );
  return { ...actual, listDeadlines: vi.fn(), dueDateHighlight: vi.fn() };
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
import type { Deadline } from "../../deadlines/deadlines.controller";
import type { Matter } from "../../matters/matters.controller";
import type { Client } from "../../clients/clients.controller";
import type { CatalogItem } from "../../catalog/catalog.controller";

const listDeadlinesMock = vi.mocked(deadlinesController.listDeadlines);
const dueDateHighlightMock = vi.mocked(deadlinesController.dueDateHighlight);
const listMattersMock = vi.mocked(mattersController.listMatters);
const listClientsMock = vi.mocked(clientsController.listClients);
const listCatalogItemsMock = vi.mocked(catalogController.listCatalogItems);

function makeDeadline(overrides: Partial<Deadline>): Deadline {
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
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 10)); // 2026-05-10, local time
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("delegates the vencido/vence-em-breve comparison to deadlines.controller (never reimplements it) and buckets purely off that mock's own output", async () => {
    const vencidoDeadline = makeDeadline({
      id: "d-vencido",
      matterId: matterComClienteECatalogo.id,
      dueDate: "2026-05-01",
    });
    const hojeDeadline = makeDeadline({
      id: "d-hoje",
      matterId: matterSemClienteOuCatalogo.id,
      dueDate: "2026-05-10",
      isFatal: true,
    });
    const proximoDeadline = makeDeadline({
      id: "d-proximo",
      matterId: "matter-desconhecido",
      dueDate: "2026-05-12",
    });
    // Due far in the future but the mock still says "on_track" — proves the
    // grouping/count is driven entirely by dueDateHighlight's return value,
    // not a locally reimplemented date comparison.
    const onTrackDeadline = makeDeadline({
      id: "d-on-track",
      matterId: matterComClienteECatalogo.id,
      dueDate: "2026-05-11",
    });

    listDeadlinesMock.mockResolvedValue([vencidoDeadline, hojeDeadline, proximoDeadline, onTrackDeadline]);
    listMattersMock.mockResolvedValue([matterComClienteECatalogo, matterSemClienteOuCatalogo]);
    listClientsMock.mockResolvedValue([client]);
    listCatalogItemsMock.mockResolvedValue([catalogItem]);

    dueDateHighlightMock.mockImplementation((dueDate) => {
      if (dueDate === vencidoDeadline.dueDate) return "vencido";
      if (dueDate === onTrackDeadline.dueDate) return "on_track";
      return "vence_em_breve";
    });

    const result = await getPrazosCriticos();

    // Delegation, not reimplementation.
    expect(listDeadlinesMock).toHaveBeenCalledWith({ status: "pendente" });
    expect(dueDateHighlightMock).toHaveBeenCalledTimes(4);
    expect(dueDateHighlightMock).toHaveBeenCalledWith(vencidoDeadline.dueDate, vencidoDeadline.status);
    expect(dueDateHighlightMock).toHaveBeenCalledWith(hojeDeadline.dueDate, hojeDeadline.status);
    expect(dueDateHighlightMock).toHaveBeenCalledWith(proximoDeadline.dueDate, proximoDeadline.status);
    expect(dueDateHighlightMock).toHaveBeenCalledWith(onTrackDeadline.dueDate, onTrackDeadline.status);

    // on_track is excluded from both the headline count and every group.
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
    listDeadlinesMock.mockResolvedValue([]);
    listMattersMock.mockResolvedValue([]);
    listClientsMock.mockResolvedValue([]);
    listCatalogItemsMock.mockResolvedValue([]);

    const result = await getPrazosCriticos();

    expect(result).toEqual({ count: 0, groups: { vencido: [], hoje: [], proximos: [] } });
    expect(dueDateHighlightMock).not.toHaveBeenCalled();
  });
});
