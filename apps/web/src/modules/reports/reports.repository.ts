import { supabase } from "@/lib/supabase";

// Direct `@/lib/supabase` queries against `clients`/`matters`/`payments` —
// RLS already scopes every one of these by tenant, same as every other
// repository file (e.g. clients.repository.ts/matters.repository.ts). Not a
// cross-module boundary violation: eslint-plugin-boundaries only forbids
// importing another module's *.service.ts/*.repository.ts file, never a
// module's own repository querying a table another module also owns —
// catalog.repository.ts's `countReferencingMatters` (a direct count against
// `matters`) is the exact same sanctioned pattern, and it predates the
// `matters` module even existing. It's also the only feasible approach here:
// clients.controller.ts/matters.controller.ts/payments.controller.ts expose
// no tenant-wide count/sum-by-status operation (only single-matter-scoped or
// full-row listings), so there is nothing to compose those aggregates from
// even if the boundary allowed it.

export interface PeriodoRange {
  from: string;
  to: string;
}

/** `{ count: "exact", head: true }` — same precedent as
 * catalog.repository.ts's `countReferencingMatters` for a cheap count with
 * no row payload. Soft-deleted rows excluded, matching
 * clients.repository.ts's `listClients`'s own default filtering (a
 * soft-deleted client is not "ativo" for reporting purposes even if its
 * `status` column still says so). */
export async function countClientsByStatus(status: string) {
  return supabase.from("clients").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", status);
}

/** Same shape as countClientsByStatus, against `matters` — soft-deleted
 * matters excluded, matching matters.repository.ts's `listMatters`. */
export async function countMattersByStatus(status: string) {
  return supabase.from("matters").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", status);
}

interface PaymentValueRow {
  // PostgREST serializes `numeric` as a JSON number, but payments.repository
  // .ts's own `PaymentRow` still types it defensively as `number | string`
  // and runs every value through `Number(...)` — mirrored here.
  value: number | string;
}

/** `from`/`to` are plain `YYYY-MM-DD` *local* calendar dates
 * (resolvePeriodoRange's output is built from the browser's local "today"),
 * but `payments.created_at` is a `timestamptz` compared as a UTC instant —
 * passing the bare date string would have PostgREST/Postgres anchor it at
 * UTC midnight, which silently drifts the whole window by the user's UTC
 * offset (e.g. for `America/Sao_Paulo`, local midnight is 03:00Z, so a
 * naive UTC-midnight boundary both misses payments made in the last hours
 * of the local `to` day and pulls in payments from the last hours of the
 * local day before `from`). `new Date(year, month - 1, day)` interprets
 * its arguments in the browser's local timezone, so `.toISOString()` gives
 * the exact UTC instant of that local calendar day's midnight — correct
 * regardless of the user's offset. */
function localDateStartUtcIso(dateIso: string): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  return new Date(year, month - 1, day).toISOString();
}

/** Exclusive upper bound for a `[from, to]` local-date range: the UTC
 * instant of local midnight on the day *after* `to`, so the query can use
 * a strict `<` and still include every payment made during the `to` day
 * itself. */
function exclusiveUpperBound(dateIso: string): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  return new Date(year, month - 1, day + 1).toISOString();
}

/** Selects raw `value` rows (filtered by status, +`created_at` window when
 * `periodo` is given) for the caller to sum client-side — PostgREST's
 * `{ count: "exact", head: true }` only gives a row count, never a real
 * `sum()`, so there is no head-only equivalent for Faturamento/A receber
 * (spec's noted data gap). Bucketed by `payments.created_at`, per the
 * spec's resolved data-gap note (no dedicated "data de pagamento" column
 * exists yet). */
export async function sumPayments(status: string, periodo?: PeriodoRange) {
  let query = supabase.from("payments").select("value").eq("status", status);
  if (periodo) {
    query = query
      .gte("created_at", localDateStartUtcIso(periodo.from))
      .lt("created_at", exclusiveUpperBound(periodo.to));
  }
  return query.returns<PaymentValueRow[]>();
}

interface PaymentValueByDayRow {
  value: number | string;
  created_at: string;
}

/** Same status/período filtering as `sumPayments("pago", periodo)`, but also
 * selects `created_at` so the caller (reports.service.ts's
 * `getFaturamentoNoTempo`) can group totals by calendar day —
 * `sumPayments` only selects `value` since none of its other callers
 * needed the timestamp. Same "no group-by via PostgREST" reasoning as
 * `sumPayments`: bucketing happens client-side, not in this query. */
export async function sumPaymentsByDay(periodo: PeriodoRange) {
  return supabase
    .from("payments")
    .select("value, created_at")
    .eq("status", "pago")
    .gte("created_at", localDateStartUtcIso(periodo.from))
    .lt("created_at", exclusiveUpperBound(periodo.to))
    .returns<PaymentValueByDayRow[]>();
}

interface MatterCatalogItemIdRow {
  matter_catalog_item_id: string | null;
}

/** One row per non-deleted matter, carrying only its catalog-item id —
 * tenant-scoped by RLS like every other query in this file. The caller
 * (reports.service.ts's `getVolumePorCatalogo`) group-counts these
 * client-side (same no-group-by-via-PostgREST reasoning as `sumPayments`)
 * and resolves ids to names via `catalog.controller.ts`'s
 * `listCatalogItems` — never `catalog.repository.ts` directly, per the
 * cross-module boundary rule (eslint-plugin-boundaries). Soft-deleted
 * matters excluded, matching `countMattersByStatus`. A `rascunho` matter
 * may have a null `matter_catalog_item_id` (schema only requires
 * client+catalog once a matter leaves `rascunho`) — the caller decides how
 * to treat that, this query just passes it through. */
export async function listMatterCatalogItemIds() {
  return supabase
    .from("matters")
    .select("matter_catalog_item_id")
    .is("deleted_at", null)
    .returns<MatterCatalogItemIdRow[]>();
}

export type { PaymentValueRow, PaymentValueByDayRow, MatterCatalogItemIdRow };
