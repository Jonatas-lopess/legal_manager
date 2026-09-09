# Dashboard/Relatórios — screens brief (for wireframing)

Functional summary only — no layout/positioning implied, that's the wireframe's call. One page: **Painel** (dashboard/reports landing).

## Global control

- **Período** selector — 5 fixed buckets: últimos 7 / 30 / 90 dias, últimos 6 meses, últimos 12 meses. Affects every period-scoped metric below. Default 30 dias.
- Shortcut link to the full `deadlines` listing ("ver todos os prazos").

## Metrics

1. **Clientes ativos** — count of `clients` where `status = ativo`. Not period-scoped (live count).
2. **Matters em andamento** — count of `matters` where `status = em_andamento`; period-scoping TBD (see Open questions).
3. **Faturamento** — sum of `payments.value` where `status = pago`, scoped to período. Currency (BRL).
4. **A receber** — sum of `payments.value` where `status = pendente`. Not period-scoped (total outstanding).
5. **Prazos vencendo/vencidos** — count of `deadlines` where `status = pendente` and due within the alert window (5 dias úteis) or already overdue. Priority metric (PLANNING §1's stated differentiator).

## Faturamento no tempo

- Time series, one point per day in the selected período, y = soma de `payments.value` (status `pago`) daquele dia.
- **Data gap**: `payments` has no dedicated "data de pagamento" field today (only `createdAt`/`updatedAt`, no `paid_date` like ManagerDesk's `payment_date`). Bucketing by day will use `createdAt` (or the timestamp the status flips to `pago`, if that becomes trackable) — pin this in the spec pass, may need a schema addition.
- Single series ("Renda"/faturamento).

## Prazos próximos/vencidos

- Compact list, top N only (not the full `deadlines` screen), each row: matter (client + catalog item), descrição, due date, overdue/vence-em-breve badge, `is_fatal` flag.
- Reuses the same due-date comparison logic `deadlines-engine-alerts` already built for its own listing screen — no new computation, no separate report query.
- "Ver todos" action → full `deadlines` listing screen.

## Matters por status

- Count per `matterStatuses` value: `rascunho`, `em_andamento`, `concluido`, `arquivado` — tenant-scoped.

## Volume por item de catálogo

- For each `catalog` item (`matter_catalog_items.name`), count of `matters` referencing it (`matterCatalogItemId`). Top N, rest collapsed under "outros" if the catalog list is long.

## Clientes ativos por status

- `clientStatuses` is just `ativo`/`inativo` — a two-value ratio, not a multi-category breakdown.

## Open questions for the wireframe

- **RBAC**: no role currently restricts dashboard access (PLANNING §8's base matrix is silent on "reports"). Should **faturamento**/**a receber** be hidden for `secretario`, matching `payments` CRUD's existing exclusion of that role? If yes, wireframe both a "full" and a "secretario" variant.
- **Empty state**: brand-new tenant with zero clients/matters/payments/deadlines — every metric renders 0/empty, not broken. Worth its own wireframe state.
- **Loading state**: ManagerDesk uses skeleton placeholders while queries resolve — one skeleton variant is probably enough to note.

## Explicitly out of scope

- No drill-down/detail views beyond "ver todos" links to existing list screens (clients, matters, deadlines) — this page aggregates, it doesn't duplicate CRUD.
- No date-range custom picker beyond the 5 fixed buckets.
- No export (CSV/PDF) — not mentioned in PLANNING §4, treat as future unless raised.
