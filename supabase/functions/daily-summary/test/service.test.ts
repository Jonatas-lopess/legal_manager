import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  buildMatterLabel,
  buildUserPrompt,
  categorizeDeadlines,
  EMPTY_SNAPSHOT_SUMMARY,
  generateDailySummary,
  HttpError,
  isSnapshotEmpty,
  type DailySnapshot,
} from "../service.ts";
import type { DeadlineRow } from "../repository.ts";

function row(overrides: Partial<DeadlineRow> = {}): DeadlineRow {
  return {
    id: "d1",
    description: "Contestação",
    due_date: "2026-09-22",
    is_fatal: false,
    matter_description: null,
    client_name: "Maria Silva",
    catalog_item_name: "Ação trabalhista",
    ...overrides,
  };
}

describe("buildMatterLabel", () => {
  it("prefers client + catalog item", () => {
    expect(buildMatterLabel(row())).toBe("Maria Silva — Ação trabalhista");
  });

  it("falls back to matter description when client/catalog missing", () => {
    expect(
      buildMatterLabel(row({ client_name: null, catalog_item_name: null, matter_description: "Processo avulso" })),
    ).toBe("Processo avulso");
  });

  it("falls back to a placeholder when nothing is available", () => {
    expect(buildMatterLabel(row({ client_name: null, catalog_item_name: null, matter_description: null }))).toBe(
      "Processo sem descrição",
    );
  });
});

describe("categorizeDeadlines", () => {
  it("buckets by comparing due_date to today (lexicographic ISO comparison)", () => {
    const rows = [
      row({ id: "overdue", due_date: "2026-09-20" }),
      row({ id: "today", due_date: "2026-09-22" }),
      row({ id: "week", due_date: "2026-09-25" }),
    ];

    const result = categorizeDeadlines(rows, "2026-09-22");

    expect(result.overdue.map((i) => i.dueDate)).toEqual(["2026-09-20"]);
    expect(result.dueToday.map((i) => i.dueDate)).toEqual(["2026-09-22"]);
    expect(result.dueThisWeek.map((i) => i.dueDate)).toEqual(["2026-09-25"]);
  });
});

describe("isSnapshotEmpty", () => {
  const empty: DailySnapshot = { today: "2026-09-22", overdue: [], dueToday: [], dueThisWeek: [], activeMattersCount: 0 };

  it("is true when nothing is pending and no matter is active", () => {
    expect(isSnapshotEmpty(empty)).toBe(true);
  });

  it("is false when there's at least one active matter", () => {
    expect(isSnapshotEmpty({ ...empty, activeMattersCount: 1 })).toBe(false);
  });

  it("is false when there's at least one pending deadline", () => {
    expect(
      isSnapshotEmpty({ ...empty, dueToday: [{ matterLabel: "x", description: "y", dueDate: "2026-09-22", isFatal: false }] }),
    ).toBe(false);
  });
});

describe("buildUserPrompt", () => {
  it("names every bucket with an explicit count, even when empty", () => {
    const snapshot: DailySnapshot = {
      today: "2026-09-22",
      overdue: [{ matterLabel: "Maria Silva — Ação trabalhista", description: "Contestação", dueDate: "2026-09-20", isFatal: true }],
      dueToday: [],
      dueThisWeek: [],
      activeMattersCount: 3,
    };

    const prompt = buildUserPrompt(snapshot);

    expect(prompt).toContain("Data de hoje: 2026-09-22");
    expect(prompt).toContain("Matters em andamento: 3");
    expect(prompt).toContain("Prazos vencidos (1):");
    expect(prompt).toContain("[FATAL]");
    expect(prompt).toContain("Prazos que vencem hoje (0):");
    expect(prompt).toContain("Prazos que vencem nos próximos 7 dias (0):");
  });
});

describe("generateDailySummary", () => {
  const authClient = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
  };

  function fakeDb(tenantRow: { tenant_id: string } | undefined, deadlineRows: DeadlineRow[], activeCount: number) {
    return {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("from public.users")) return Promise.resolve({ rows: tenantRow ? [tenantRow] : [] });
        if (sql.includes("from public.matters")) return Promise.resolve({ rows: [{ count: String(activeCount) }] });
        return Promise.resolve({ rows: deadlineRows });
      }),
    } as unknown as Pool;
  }

  it("throws 401 when there's no JWT", async () => {
    const callModel = vi.fn();
    await expect(
      generateDailySummary({ db: fakeDb({ tenant_id: "t1" }, [], 0), authClient, callModel }, null),
    ).rejects.toThrow(HttpError);
  });

  it("throws 403 when the caller has no tenant row", async () => {
    const callModel = vi.fn();
    await expect(
      generateDailySummary({ db: fakeDb(undefined, [], 0), authClient, callModel }, "jwt"),
    ).rejects.toThrow(HttpError);
  });

  it("returns the canned message and skips the model call for an empty snapshot", async () => {
    const callModel = vi.fn();
    const result = await generateDailySummary(
      { db: fakeDb({ tenant_id: "t1" }, [], 0), authClient, callModel, today: "2026-09-22" },
      "jwt",
    );

    expect(result.summary).toBe(EMPTY_SNAPSHOT_SUMMARY);
    expect(callModel).not.toHaveBeenCalled();
    expect(result.stats).toEqual({ overdueCount: 0, dueTodayCount: 0, dueThisWeekCount: 0, activeMattersCount: 0 });
  });

  it("calls the model and returns its text when there's data", async () => {
    const callModel = vi.fn().mockResolvedValue("Resumo gerado.");
    const result = await generateDailySummary(
      {
        db: fakeDb({ tenant_id: "t1" }, [row({ due_date: "2026-09-22" })], 2),
        authClient,
        callModel,
        today: "2026-09-22",
      },
      "jwt",
    );

    expect(callModel).toHaveBeenCalledOnce();
    expect(result.summary).toBe("Resumo gerado.");
    expect(result.stats.dueTodayCount).toBe(1);
    expect(result.stats.activeMattersCount).toBe(2);
  });
});
