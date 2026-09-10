# 02: Métricas charts & breakdowns

**What to build:** Extends `/dashboard/metricas` (built in `01`) with the chart/breakdown half of the wireframe: **Faturamento no tempo** — one point per day in the selected período, y = sum of `payments.value` (status `pago`) that day, single série ("Renda"), bucketed by `payments.createdAt` (the schema has no dedicated "data de pagamento" field yet — using `createdAt` as the bucketing key is the resolved fallback from the screens-brief data-gap note, not a new schema addition). **Matters por status** breakdown across `rascunho`/`em_andamento`/`concluido`/`arquivado`, tenant-scoped. **Volume por item de catálogo** breakdown — count of `matters` per `matter_catalog_items.name`, top N with an "outros" bucket for the rest. **Clientes ativos por status** ratio (`ativo`/`inativo`).

**Blocked by:** `01` (needs the Métricas page shell, nav, and período-selector context this extends)

**Status:** ready-for-agent

- [ ] Faturamento no tempo renders one point per day across the selected período, values match `payments` fixtures (status `pago`, bucketed by `createdAt`); re-renders when período changes
- [ ] Matters por status breakdown shows correct counts for all four statuses, tenant-scoped
- [ ] Volume por item de catálogo shows top-N catalog items by matter count, remainder collapsed into "outros" when the catalog list exceeds N
- [ ] Clientes ativos por status renders the `ativo`/`inativo` ratio correctly
- [ ] Loading skeleton per section while queries resolve; zero-data tenant renders empty/zeroed chart and breakdowns, not broken
- [ ] Integration test (real disposable Postgres): tenant isolation on each breakdown query, correct période-window filtering on Faturamento no tempo
