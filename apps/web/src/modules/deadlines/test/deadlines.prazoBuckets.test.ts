// getPrazoBuckets (ui-shell-clientes-casos-config/03, spec.md fidelity
// check point 9) — the vencido/hoje/próximos bucketing helper extracted out
// of reports.service.ts's getPrazosCriticos, which had this exact grouping
// private to itself (dashboard-reports' own code-review flagged that as
// duplicated date-arithmetic that belonged in this module instead). The
// first test below is the delegation/grouping coverage moved from
// reports/test/reports.prazos.test.ts (unchanged in substance — the
// vencido/hoje/próximos split and the on_track exclusion), followed by one
// new case for the added `matterId` param (casos-detalhe's Prazos card,
// scoped to a single matter — reports' own call passes no matterId at all).
// `deadlines.repository.ts` is mocked (fully DB-free), same style as
// deadlines.crud.test.ts's real counterpart but without the real Postgres
// round trip — this suite only exercises the pure grouping logic on top of
// whatever the repository hands back.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../deadlines.repository", async () => {
  const actual = await vi.importActual<typeof import("../deadlines.repository")>("../deadlines.repository");
  return { ...actual, listDeadlines: vi.fn() };
});

import { getPrazoBuckets } from "../deadlines.service";
import * as repo from "../deadlines.repository";
import type { DeadlineRow } from "../deadlines.repository";

const listDeadlinesMock = vi.mocked(repo.listDeadlines);

function makeRow(overrides: Partial<DeadlineRow>): DeadlineRow {
  return {
    id: "deadline-id",
    matter_id: "matter-id",
    is_fatal: false,
    counting_mode: "dias_corridos",
    days: 10,
    start_date: "2026-01-01",
    description: "Descrição",
    status: "pendente",
    due_date: "2026-01-10",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("getPrazoBuckets", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 10)); // 2026-05-10, local time
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("buckets pendente deadlines into vencido/hoje/próximos, excluding on_track (moved from reports.service.ts)", async () => {
    const vencidoRow = makeRow({ id: "d-vencido", due_date: "2026-05-01" });
    const hojeRow = makeRow({ id: "d-hoje", due_date: "2026-05-10", is_fatal: true });
    const proximoRow = makeRow({ id: "d-proximo", due_date: "2026-05-12" });
    // Due more than 5 calendar days out — dueDateHighlight calls this
    // on_track, so it must be excluded from both the count and every group.
    const onTrackRow = makeRow({ id: "d-on-track", due_date: "2026-05-20" });

    listDeadlinesMock.mockResolvedValue({
      data: [vencidoRow, hojeRow, proximoRow, onTrackRow],
      error: null,
    } as never);

    const result = await getPrazoBuckets();

    expect(listDeadlinesMock).toHaveBeenCalledWith({ status: "pendente", matterId: undefined });

    expect(result.count).toBe(3);
    expect(result.groups.vencido).toHaveLength(1);
    expect(result.groups.vencido[0]).toMatchObject({ id: "d-vencido", dueDate: "2026-05-01", highlight: "vencido" });

    expect(result.groups.hoje).toHaveLength(1);
    expect(result.groups.hoje[0]).toMatchObject({
      id: "d-hoje",
      dueDate: "2026-05-10",
      isFatal: true,
      highlight: "vence_em_breve",
    });

    expect(result.groups.proximos).toHaveLength(1);
    expect(result.groups.proximos[0]).toMatchObject({
      id: "d-proximo",
      dueDate: "2026-05-12",
      highlight: "vence_em_breve",
    });
  });

  it("returns a zero headline and empty groups when there are no pendente deadlines", async () => {
    listDeadlinesMock.mockResolvedValue({ data: [], error: null } as never);

    const result = await getPrazoBuckets();

    expect(result).toEqual({ count: 0, groups: { vencido: [], hoje: [], proximos: [] } });
  });

  // New case (this ticket): the added `matterId` param — casos-detalhe's
  // Prazos card scopes to a single matter, unlike reports.service.ts's
  // tenant-wide call above (which passes no matterId at all).
  it("forwards matterId to listDeadlines when scoping to a single matter", async () => {
    const scopedRow = makeRow({ id: "d-scoped", matter_id: "matter-42", due_date: "2026-05-01" });
    listDeadlinesMock.mockResolvedValue({ data: [scopedRow], error: null } as never);

    const result = await getPrazoBuckets("matter-42");

    expect(listDeadlinesMock).toHaveBeenCalledWith({ status: "pendente", matterId: "matter-42" });
    expect(result.count).toBe(1);
    expect(result.groups.vencido).toHaveLength(1);
    expect(result.groups.vencido[0]).toMatchObject({ id: "d-scoped", matterId: "matter-42" });
  });
});
