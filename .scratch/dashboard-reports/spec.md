Status: blocked (waiting on Figma wireframes — user is drafting manually, will hand off link)

# Dashboard/Relatórios MVP (PLANNING §7 step 6)

## Problem Statement

`clients-catalog-matters-crud` and `deadlines-engine-alerts` land the data (clients, matters, payments, deadlines, catalog items) but there is no aggregate view of it — every number lives behind a list screen filtered one record at a time. PLANNING §4 ("Relatórios (MVP)") and §7 step 6 call for a landing dashboard focused on prazos (the product's differentiator, per §1) plus the standard SaaS-office counts: clientes ativos, matters por status, faturamento por período, volume por item de catálogo.

ManagerDesk's `dashboard.tsx` (sibling repo, `src/pages/dashboard.tsx`) is the closest prior art — `StatCard`/`TableCard`/`recharts` area chart, period selector, a "recent activity" list — but it was built for a **single-tenant, single-user desktop app with no real auth**, so it gates itself behind a hardcoded session password (`isUnlocked`/`UnlockDialog`, `VITE_DASHBOARD_PASSWORD`). This project already has tenant-scoped Supabase Auth + RBAC (`tenants-auth-invite`) — that gate does not port; the dashboard is reachable by any authenticated tenant member, scoped by RLS like every other screen.

## Solution (draft — pending screens doc)

New `dashboard`/`reports` bounded context (naming TBD) under `apps/web/src/modules/`, read-only, aggregating across `clients`, `matters`, `payments`, `deadlines`, `catalog` via their public controllers (no new tables, no direct cross-module repository access — same boundary rule as every other module, `eslint-plugin-boundaries`).

**Two screens, not one** (decided 2026-09-09, see screens-brief.md): **Métricas** (stat cards + faturamento chart + breakdowns) and **Prazos** (deadlines agenda/list — the priority metric per §1 gets its own focal screen instead of sharing one generic "Painel"). Same bounded context/module either way — this is a routing/UI split, not a new module boundary. Prazos page ships as a list/agenda for MVP; a calendar grid (month/week, drag-drop) is deferred to v2 — no prior art for it in ManagerDesk's `dashboard.tsx`.

Report set (PLANNING §4, unchanged from planning doc — confirm against wireframes once available), now split by page:

Métricas:
- Clientes ativos por status
- Matters por status
- Faturamento por período (reuse ManagerDesk's period-selector + area-chart pattern, adapted from `services`+`payments` to this project's `matters`+`payments`)
- Volume por item de catálogo
- Prazos vencendo/vencidos — teaser card only, links to the Prazos page, reuses that page's count (no duplicate query)

Prazos:
- Prazos próximos/vencidos (priority metric per §1 — reuses `deadlines` listing's overdue/vence-em-breve comparison already built in `deadlines-engine-alerts`, per that spec's "no separate report query — the full aggregate dashboard is step 6, out of scope here") as both the headline count and the agenda/list body

## Open — blocking implementation

- **Screens doc + Figma wireframes**: user is hand-drawing wireframes in Figma directly (MCP Figma seat is View-only on `A equipe de Jonatas Lopes`/starter tier — can't create/edit files via MCP). Will share the file/link when ready. Do not start component-level layout work before that lands; the report list/metrics above can still inform schema/query design.
- **Module boundary/interface contract**: per repo convention (see `deadlines-engine-alerts/spec.md`'s "Modules" bullet), this is decided inside this spec's Implementation Decisions once scope is settled — no standalone contract file. Draft once screens doc confirms exactly which aggregates each screen needs (shapes the `reports.controller.ts` export surface). Now two screens sharing one module — decide route shape (two routes vs. tabs on one route) alongside the contract.
- **RBAC**: no role restricts dashboard/report access per PLANNING §8's base matrix (silent on reports) — confirm this holds, or whether `payments`/faturamento figures should stay `secretario`-excluded to match `payments` CRUD's existing role gate (`tags-matter-tagging`/`05-payments-matter-scoped-role-gated.md`).
