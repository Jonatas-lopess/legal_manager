// Read-only module (aggregates over clients/matters/payments) — no
// client-facing create/update input at all, same precedent as
// notifications.schema.ts having none. This file only carries the module's
// own domain types: the fixed set of "período" buckets the Métricas page's
// selector offers, and their Portuguese labels.

export const periodoBuckets = ["7d", "30d", "90d", "6m", "12m"] as const;
export type PeriodoBucket = (typeof periodoBuckets)[number];

export const periodoBucketLabels: Record<PeriodoBucket, string> = {
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  "6m": "Últimos 6 meses",
  "12m": "Últimos 12 meses",
};

export const defaultPeriodoBucket: PeriodoBucket = "30d";

// `DueDateHighlight` is re-imported as a type only (ticket 03's cross-module
// boundary rule allows a `.controller.ts`-to-`.controller.ts`/schema import,
// just never a `.repository.ts`/`.service.ts` one) — this file doesn't
// recompute the vencido/vence-em-breve comparison, it just carries the
// resulting value on each row so PrazosPage.tsx can render the right badge.
import type { DueDateHighlight } from "../deadlines/deadlines.controller";

/**
 * One row of the Prazos page's agenda list (ticket 03). `matterLabel` is
 * already fully resolved by reports.service.ts's `getPrazosCriticos` —
 * "cliente — item de catálogo" when the deadline's matter has both linked,
 * the matter's own fallback label (no client/catalog item yet, e.g. a
 * `rascunho` matter) when it exists but is missing either one, or "—" when
 * the matter itself can't be resolved at all. Kept as a single pre-joined
 * string rather than three nullable fields since every consumer (the
 * Prazos page) only ever renders it as one column, per the ticket's
 * "matter (client + catalog item, or the fallback)" wording.
 */
export interface PrazoRow {
  id: string;
  matterLabel: string;
  description: string;
  dueDate: string;
  highlight: DueDateHighlight;
  isFatal: boolean;
}

export interface PrazoGroups {
  vencido: PrazoRow[];
  hoje: PrazoRow[];
  proximos: PrazoRow[];
}
