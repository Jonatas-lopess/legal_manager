import type { PeriodoBucket, PrazoRow, PrazoGroups } from "./reports.schema";
import * as repo from "./reports.repository";
import { getCurrentUser } from "../tenants/tenants.controller";
import { matterStatuses, listMatters } from "../matters/matters.controller";
import type { MatterStatus, Matter } from "../matters/matters.controller";
import * as catalogController from "../catalog/catalog.controller";
import { listClients } from "../clients/clients.controller";
import type { Client } from "../clients/clients.controller";
import { getPrazoBuckets, type PrazoBucketDeadline } from "../deadlines/deadlines.controller";

// --- Período-range resolution — a pure function of "today" (spec's Testing
// Decisions: unit-test with fake timers, exact-date-literal assertions, no
// DB), mirroring deadlines.service.ts's todayLocalIso()/addLocalCalendarDays
// style for "today" arithmetic and toUtcMs()/toIsoDate() for exact calendar
// math. Not re-exported via reports.controller.ts (same precedent as
// deadlines.service.ts's computeDueDate, which stays internal and is tested
// by importing this file directly, not the controller) — only the
// orchestration functions further down are the module's public surface.

const MS_PER_DAY = 86_400_000;

function todayLocalIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function toUtcMs(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function toIsoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function subtractCalendarDays(iso: string, days: number): string {
  return toIsoDate(toUtcMs(iso) - days * MS_PER_DAY);
}

/** `payments.created_at` is a UTC instant; `enumerateCalendarDates` below
 * produces *local* calendar-date keys (same "today" the rest of this file
 * uses). Slicing the ISO string's first 10 characters would instead read
 * the UTC calendar date, which disagrees with the local one for any
 * non-UTC timezone — e.g. a payment made at 23:00 in `America/Sao_Paulo`
 * lands on the *next* UTC calendar day, so it would key into a date
 * `enumerateCalendarDates` never emits and silently vanish from the
 * series. Using the local getters here keeps the bucket key consistent
 * with the range it's being looked up against. */
function toLocalDateString(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Subtracts whole calendar months, clamping the day-of-month to the target
 * month's last day when it doesn't have one (e.g. Aug 31 minus 6 months ->
 * Feb 28/29, not an overflow into March) — the same convention common
 * date libraries use, rather than letting `Date`'s native month rollover
 * silently spill into an adjacent month. */
function subtractCalendarMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const totalMonths = year * 12 + (month - 1) - months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthIndex = ((totalMonths % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, daysInTargetMonth);
  return `${targetYear}-${String(targetMonthIndex + 1).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

const PERIODO_DAYS: Partial<Record<PeriodoBucket, number>> = { "7d": 7, "30d": 30, "90d": 90 };
const PERIODO_MONTHS: Partial<Record<PeriodoBucket, number>> = { "6m": 6, "12m": 12 };

/** Resolves a `PeriodoBucket` to a `{ from, to }` ISO-date range: `to` is
 * always today, `from` is today minus N calendar days (7d/30d/90d) or N
 * calendar months (6m/12m). */
export function resolvePeriodoRange(bucket: PeriodoBucket): { from: string; to: string } {
  const to = todayLocalIso();
  const days = PERIODO_DAYS[bucket];
  if (days !== undefined) return { from: subtractCalendarDays(to, days), to };

  const months = PERIODO_MONTHS[bucket];
  if (months !== undefined) return { from: subtractCalendarMonths(to, months), to };

  // Unreachable as long as PERIODO_DAYS/PERIODO_MONTHS together cover every
  // PeriodoBucket value (reports.schema.ts's `periodoBuckets` is the source
  // of truth) — kept as a defensive guard rather than a non-null assertion.
  throw new Error(`Bucket de período desconhecido: ${bucket}`);
}

/** Every calendar date from `from` to `to` inclusive, ascending — used by
 * `getFaturamentoNoTempo` so a day with no `pago` payment still renders as
 * a zeroed point instead of being missing from the series (ticket 02: "one
 * point per day across the selected período"). Reuses the same UTC
 * calendar-day arithmetic as `subtractCalendarDays`/`resolvePeriodoRange`. */
function enumerateCalendarDates(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let ms = toUtcMs(from); ms <= toUtcMs(to); ms += MS_PER_DAY) {
    dates.push(toIsoDate(ms));
  }
  return dates;
}

// --- Orchestration — each function below calls reports.repository.ts for
// the actual aggregate query. Faturamento/A receber are a deliberate RBAC
// judgment call beyond what the ticket literally states (see ticket 01's
// Comments): PLANNING §8's base matrix is silent on "reports", and this data
// isn't RLS-forbidden to `secretario` (unlike payments.service.ts's
// `requireNonSecretario`, which throws) — it's a display-only policy, so
// these two return `null` for that role instead of erroring, and
// MetricasPage.tsx hides the corresponding card when its value is `null`.
// Clientes ativos/Matters em andamento have no such gate — every role sees
// them (matches every other list function in this codebase that doesn't
// need a role check: RLS's tenant scoping is the only restriction).

export async function getClientesAtivos(): Promise<number> {
  const { count, error } = await repo.countClientsByStatus("ativo");
  if (error) throw error;
  return count ?? 0;
}

export async function getMattersEmAndamento(): Promise<number> {
  const { count, error } = await repo.countMattersByStatus("em_andamento");
  if (error) throw error;
  return count ?? 0;
}

export async function getFaturamento(periodo: PeriodoBucket): Promise<number | null> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Não autenticado.");
  if (user.role === "secretario") return null;

  const range = resolvePeriodoRange(periodo);
  const { data, error } = await repo.sumPayments("pago", range);
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + Number(row.value), 0);
}

export async function getAReceber(): Promise<number | null> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Não autenticado.");
  if (user.role === "secretario") return null;

  const { data, error } = await repo.sumPayments("pendente");
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + Number(row.value), 0);
}

/** Time-series version of the same revenue figure as `getFaturamento` — one
 * point per day across `periodo`, y = sum of `pago` payments that day
 * (bucketed by `payments.created_at`, per the spec's resolved data-gap
 * note). Gated behind the same `secretario` check as
 * `getFaturamento`/`getAReceber`: this is a judgment call beyond ticket
 * 02's literal text, not something the ticket specifies — it's the exact
 * same revenue metric as the Faturamento card, just plotted over time, so
 * hiding the total while showing the trend would be an inconsistent policy
 * leak (a `secretario` could just eyeball-sum the chart to recover the
 * number the stat card hides). Days with no `pago` payment come back as
 * `total: 0` rather than being omitted, so a zero-data tenant still gets a
 * full, zeroed series instead of an empty one. */
export async function getFaturamentoNoTempo(
  periodo: PeriodoBucket,
): Promise<{ date: string; total: number }[] | null> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Não autenticado.");
  if (user.role === "secretario") return null;

  const range = resolvePeriodoRange(periodo);
  const { data, error } = await repo.sumPaymentsByDay(range);
  if (error) throw error;

  const totalsByDate = new Map<string, number>();
  for (const row of data ?? []) {
    const date = toLocalDateString(row.created_at);
    totalsByDate.set(date, (totalsByDate.get(date) ?? 0) + Number(row.value));
  }

  return enumerateCalendarDates(range.from, range.to).map((date) => ({
    date,
    total: totalsByDate.get(date) ?? 0,
  }));
}

/** Counts across all four `matters.status` values, tenant-scoped — one
 * `countMattersByStatus` call per status, run in parallel rather than
 * added as a single new repository query (ticket 02: either is fine, this
 * is the smaller diff since `countMattersByStatus` already exists). */
export async function getMattersPorStatus(): Promise<Record<MatterStatus, number>> {
  const entries = await Promise.all(
    matterStatuses.map(async (status) => {
      const { count, error } = await repo.countMattersByStatus(status);
      if (error) throw error;
      return [status, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<MatterStatus, number>;
}

/** `ativo`/`inativo` client counts, tenant-scoped — two `countClientsByStatus`
 * calls in parallel, same "no new repository query needed" reasoning as
 * `getMattersPorStatus`. */
export async function getClientesPorStatus(): Promise<{ ativo: number; inativo: number }> {
  const [ativo, inativo] = await Promise.all([
    repo.countClientsByStatus("ativo"),
    repo.countClientsByStatus("inativo"),
  ]);
  if (ativo.error) throw ativo.error;
  if (inativo.error) throw inativo.error;
  return { ativo: ativo.count ?? 0, inativo: inativo.count ?? 0 };
}

// Top N catalog items shown individually before the remainder collapses
// into a single "Outros" bucket (ticket 02 leaves N to the implementer —
// 5 keeps the breakdown list readable alongside the other Métricas
// sections without needing its own scroll/pagination).
const VOLUME_POR_CATALOGO_TOP_N = 5;

/** Count of non-deleted `matters` per `matter_catalog_items.name`, top
 * `VOLUME_POR_CATALOGO_TOP_N` by count descending, remainder collapsed into
 * a trailing `{ name: "Outros", ... }` entry when the catalog has more
 * items than that. A `rascunho` matter with no catalog item yet
 * (`matter_catalog_item_id: null`) isn't attributable to any item, so it's
 * excluded from every bucket rather than added to "Outros" — that bucket
 * is for catalog items that exist but didn't make the top N, not for
 * matters with none. */
export async function getVolumePorCatalogo(): Promise<{ name: string; count: number }[]> {
  const [{ data, error }, catalogItems] = await Promise.all([
    repo.listMatterCatalogItemIds(),
    catalogController.listCatalogItems(),
  ]);
  if (error) throw error;

  const countsById = new Map<string, number>();
  for (const row of data ?? []) {
    if (!row.matter_catalog_item_id) continue;
    countsById.set(row.matter_catalog_item_id, (countsById.get(row.matter_catalog_item_id) ?? 0) + 1);
  }

  const nameById = new Map(catalogItems.map((item) => [item.id, item.name] as const));
  const byCount = [...countsById.entries()]
    .map(([id, count]) => ({ name: nameById.get(id) ?? id, count }))
    .sort((a, b) => b.count - a.count);

  if (byCount.length <= VOLUME_POR_CATALOGO_TOP_N) return byCount;

  const top = byCount.slice(0, VOLUME_POR_CATALOGO_TOP_N);
  const outrosCount = byCount.slice(VOLUME_POR_CATALOGO_TOP_N).reduce((sum, item) => sum + item.count, 0);
  return [...top, { name: "Outros", count: outrosCount }];
}

// --- Prazos críticos (ticket 03 of dashboard-reports; bucketing moved out
// in ui-shell-clientes-casos-config/03, spec.md fidelity check point 9) —
// headline count + vencido/hoje/próximos grouping for the Prazos page. This
// is the ticket's own explicit regression-guard seam: the vencido/hoje/
// próximos bucketing itself is never reimplemented here — it's delegated
// entirely to `../deadlines/deadlines.controller`'s `getPrazoBuckets`
// (never `deadlines.repository.ts`/`deadlines.service.ts` directly, which
// would also break eslint-plugin-boundaries — only `.controller.ts`-to-
// `.controller.ts` cross-module imports are allowed). This function only
// resolves the "matter" display label (client + catalog item, cross-module
// data `deadlines.service.ts` has no business knowing about) for each row
// the shared bucketing already produced.

/** Same "matters have no simple name" fallback label
 * DeadlinesTable.tsx's `matterLabel` uses — duplicated locally rather than
 * shared, matching this codebase's existing precedent for that exact
 * two-field format (see DeadlinesTable.tsx's own comment on the tradeoff,
 * and DeadlineTagPicker.tsx before it; this is now a third call site of
 * the same shape). */
function matterFallbackLabel(matter: Matter): string {
  return `${matter.uf} — ${matter.description ?? matter.id.slice(0, 8)}`;
}

/** Resolves the "matter" column shown on each Prazos row (ticket 03's
 * component spec: "matter (client + catalog item, or the fallback)"):
 * "cliente — item de catálogo" when the deadline's matter has both linked,
 * the matter's own fallback label when it exists but is missing either one
 * (e.g. a `rascunho` matter with no catalog item yet), or "—" when the
 * deadline's matter itself can't be found at all — mirrors
 * DeadlinesTable.tsx's `matter ? matterLabel(matter) : "—"` fallback, one
 * level further to also cover "matter exists but client/catalog item
 * doesn't". */
function resolveMatterLabel(
  matter: Matter | undefined,
  clientById: Map<string, Client>,
  catalogItemById: Map<string, { id: string; name: string }>,
): string {
  if (!matter) return "—";
  const client = matter.clientId ? clientById.get(matter.clientId) : undefined;
  const catalogItem = matter.matterCatalogItemId ? catalogItemById.get(matter.matterCatalogItemId) : undefined;
  if (client && catalogItem) return `${client.name} — ${catalogItem.name}`;
  return matterFallbackLabel(matter);
}

/** Maps one bucketed deadline (already highlight-tagged and grouped by
 * `deadlines.controller`'s `getPrazoBuckets`) to this page's `PrazoRow` —
 * the only thing left for this module to do is resolve `matterLabel`
 * (cross-module: client + catalog item), everything else passes through. */
function toPrazoRow(
  deadline: PrazoBucketDeadline,
  matterById: Map<string, Matter>,
  clientById: Map<string, Client>,
  catalogItemById: Map<string, { id: string; name: string }>,
): PrazoRow {
  return {
    id: deadline.id,
    matterLabel: resolveMatterLabel(matterById.get(deadline.matterId), clientById, catalogItemById),
    description: deadline.description,
    dueDate: deadline.dueDate,
    highlight: deadline.highlight,
    isFatal: deadline.isFatal,
  };
}

/**
 * Headline count + vencido/hoje/próximos grouping for the Prazos page
 * (stories 12/13). The grouping itself is entirely `deadlines.controller`'s
 * `getPrazoBuckets` (no matterId — every pendente deadline in the tenant,
 * unlike casos-detalhe's matter-scoped Prazos card); this function only
 * resolves each row's `matterLabel` against `matters`/`clients`/`catalog`.
 * No RBAC gate (ticket: "Prazos page has no payments data involved").
 */
export async function getPrazosCriticos(): Promise<{ count: number; groups: PrazoGroups }> {
  const [{ count, groups: buckets }, matters, clients, catalogItems] = await Promise.all([
    getPrazoBuckets(),
    listMatters(),
    listClients(),
    catalogController.listCatalogItems(),
  ]);

  const matterById = new Map(matters.map((matter) => [matter.id, matter] as const));
  const clientById = new Map(clients.map((client) => [client.id, client] as const));
  const catalogItemById = new Map(catalogItems.map((item) => [item.id, item] as const));

  return {
    count,
    groups: {
      vencido: buckets.vencido.map((d) => toPrazoRow(d, matterById, clientById, catalogItemById)),
      hoje: buckets.hoje.map((d) => toPrazoRow(d, matterById, clientById, catalogItemById)),
      proximos: buckets.proximos.map((d) => toPrazoRow(d, matterById, clientById, catalogItemById)),
    },
  };
}
