# Dashboard/Relatórios — screens brief (for wireframing)

Functional summary only — no layout/positioning implied, that's the wireframe's call. **Two pages**, not one: **Métricas** (stat cards + charts) and **Prazos** (deadlines-focused agenda/list — the product's differentiator, PLANNING §1). Split decided 2026-09-09: prazos is the priority metric per §1 and deserves its own focal screen instead of sharing a single "Painel" with the generic SaaS counts.

## Página 1 — Métricas

### Global control

- **Período** selector — 5 fixed buckets: últimos 7 / 30 / 90 dias, últimos 6 meses, últimos 12 meses. Affects every period-scoped metric below. Default 30 dias.
- Nav link to the **Prazos** page ("ver prazos") — teaser card, not the full computation (see below).

### Metrics (cards)

1. **Clientes ativos** — count of `clients` where `status = ativo`. Not period-scoped (live count).
2. **Matters em andamento** — count of `matters` where `status = em_andamento`; period-scoping TBD (see Open questions).
3. **Faturamento** — sum of `payments.value` where `status = pago`, scoped to período. Currency (BRL).
4. **A receber** — sum of `payments.value` where `status = pendente`. Not period-scoped (total outstanding).
5. **Prazos vencendo/vencidos** (teaser) — same count as the Prazos page headline (below), shown here as a quick-glance card that links there. No separate query — reuses the Prazos page's computation.

### Faturamento no tempo

- Time series, one point per day in the selected período, y = soma de `payments.value` (status `pago`) daquele dia.
- **Data gap**: `payments` has no dedicated "data de pagamento" field today (only `createdAt`/`updatedAt`, no `paid_date` like ManagerDesk's `payment_date`). Bucketing by day will use `createdAt` (or the timestamp the status flips to `pago`, if that becomes trackable) — pin this in the spec pass, may need a schema addition.
- Single série ("Renda"/faturamento).

### Matters por status

- Count per `matterStatuses` value: `rascunho`, `em_andamento`, `concluido`, `arquivado` — tenant-scoped.

### Volume por item de catálogo

- For each `catalog` item (`matter_catalog_items.name`), count of `matters` referencing it (`matterCatalogItemId`). Top N, rest collapsed under "outros" if the catalog list is long.

### Clientes ativos por status

- `clientStatuses` is just `ativo`/`inativo` — a two-value ratio, not a multi-category breakdown.

## Página 2 — Prazos (foco principal)

No período selector on this page — prazos is inherently forward-looking (o que vence / já venceu), not a historical bucket. If a filter is needed later it's a date-nav (day/week/month), not the 5-bucket período control.

### Headline metric

- **Prazos vencendo/vencidos** — count of `deadlines` where `status = pendente` and due within the alert window (5 dias úteis) or already overdue. Same computation the Métricas teaser card links to.

### Prazos próximos/vencidos — MVP view: agenda/list

- Compact list (not a calendar grid), grouped by **vencido / hoje / próximos**, each row: matter (client + catalog item), descrição, due date, overdue/vence-em-breve badge, `is_fatal` flag.
- Reuses the same due-date comparison logic `deadlines-engine-alerts` already built for its own listing screen — no new computation, no separate report query.
- "Ver todos" action → full `deadlines` listing screen (existing CRUD screen from `deadlines-engine-alerts`).
- **Calendar grid (month/week view, drag-drop) is explicitly deferred to v2** — no prior art in ManagerDesk's `dashboard.tsx` (StatCard/chart only, no calendar component), and spec.md's "no drill-down" scope note applies here too. MVP ships the list/agenda first.

## Open questions for the wireframe

- **RBAC**: no role currently restricts dashboard access (PLANNING §8's base matrix is silent on "reports"). Should **faturamento**/**a receber** be hidden for `secretario`, matching `payments` CRUD's existing exclusion of that role? If yes, wireframe both a "full" and a "secretario" variant of the Métricas page. Prazos page has no `payments` data, so no gating needed there.
- **Empty state**: brand-new tenant with zero clients/matters/payments/deadlines — every metric renders 0/empty, not broken. Needed on both pages now (was one wireframe state, now two).
- **Loading state**: ManagerDesk uses skeleton placeholders while queries resolve — one skeleton variant per page is probably enough to note.
- **Nav placement**: two separate routes (e.g. `/dashboard/metricas`, `/dashboard/prazos`) or tabs within one route/module? Affects `reports.controller.ts` surface — pin down in spec.md's Implementation Decisions once wireframes land.

## Explicitly out of scope

- Calendar grid UI (month/week, drag-drop) on the Prazos page — v2, see above.
- No drill-down/detail views beyond "ver todos" links to existing list screens (clients, matters, deadlines) — these pages aggregate, they don't duplicate CRUD.
- No date-range custom picker beyond the 5 fixed buckets (Métricas page only — Prazos page has no período control at all).
- No export (CSV/PDF) — not mentioned in PLANNING §4, treat as future unless raised.
