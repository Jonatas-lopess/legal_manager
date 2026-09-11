# 02: Métricas charts & breakdowns

**What to build:** Extends `/dashboard/metricas` (built in `01`) with the chart/breakdown half of the wireframe: **Faturamento no tempo** — one point per day in the selected período, y = sum of `payments.value` (status `pago`) that day, single série ("Renda"), bucketed by `payments.createdAt` (the schema has no dedicated "data de pagamento" field yet — using `createdAt` as the bucketing key is the resolved fallback from the screens-brief data-gap note, not a new schema addition). **Matters por status** breakdown across `rascunho`/`em_andamento`/`concluido`/`arquivado`, tenant-scoped. **Volume por item de catálogo** breakdown — count of `matters` per `matter_catalog_items.name`, top N with an "outros" bucket for the rest. **Clientes ativos por status** ratio (`ativo`/`inativo`).

**Blocked by:** `01` (needs the Métricas page shell, nav, and período-selector context this extends)

**Status:** done

- [x] Faturamento no tempo renders one point per day across the selected período, values match `payments` fixtures (status `pago`, bucketed by `createdAt`); re-renders when período changes
- [x] Matters por status breakdown shows correct counts for all four statuses, tenant-scoped
- [x] Volume por item de catálogo shows top-N catalog items by matter count, remainder collapsed into "outros" when the catalog list exceeds N
- [x] Clientes ativos por status renders the `ativo`/`inativo` ratio correctly
- [x] Loading skeleton per section while queries resolve; zero-data tenant renders empty/zeroed chart and breakdowns, not broken
- [x] Integration test (real disposable Postgres): tenant isolation on each breakdown query, correct période-window filtering on Faturamento no tempo

## Comments

Implemented alongside `01`/`03`/`04` in one pass — see `01`'s Comments for the full implementation summary, verification, and the 2026-09-11 code-review pass (two confirmed bugs fixed, both in this ticket's own `getFaturamentoNoTempo`/`sumPaymentsByDay` path: a `payments.created_at` UTC-vs-local-calendar-date mismatch on both the query's period-window boundary and the chart's day-bucketing key).
