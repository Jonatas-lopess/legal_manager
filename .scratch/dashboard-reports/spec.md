Status: ready-for-agent

# Dashboard/Relatórios MVP (PLANNING §7 step 6)

## Problem Statement

`clients-catalog-matters-crud` and `deadlines-engine-alerts` land the data (clients, matters, payments, deadlines, catalog items) but there is no aggregate view of it — every number lives behind a list screen filtered one record at a time. PLANNING §4 ("Relatórios (MVP)") and §7 step 6 call for a landing dashboard focused on prazos (the product's differentiator, per §1) plus the standard SaaS-office counts: clientes ativos, matters por status, faturamento por período, volume por item de catálogo.

ManagerDesk's `dashboard.tsx` (sibling repo, `src/pages/dashboard.tsx`) is the closest prior art — `StatCard`/`TableCard`/`recharts` area chart, period selector, a "recent activity" list — but it was built for a **single-tenant, single-user desktop app with no real auth**, so it gates itself behind a hardcoded session password (`isUnlocked`/`UnlockDialog`, `VITE_DASHBOARD_PASSWORD`). This project already has tenant-scoped Supabase Auth + RBAC (`tenants-auth-invite`) — that gate does not port; the dashboard is reachable by any authenticated tenant member, scoped by RLS like every other screen.

## Wireframes (Figma)

Two hand-drawn wireframes, "Legal" Figma file: https://www.figma.com/design/FlfSZ1yXCF63y6KijLYuvQ/Legal

- **Métricas** — node `4:5`, frame `metricas-dashboard`
- **Prazos** — node `4:164`, frame `prazos-agenda`

Both are structural wireframes — per the user, positioning/spacing details in them are approximate and not meant to be pixel-matched. What they do settle: page structure (stat-card row → chart/breakdown grid on Métricas; headline callout → grouped agenda table on Prazos), the shared top-bar nav shape, and the full visual palette/type system, extracted below.

### Design tokens

Pulled directly from the wireframe's Tailwind-class output (`get_design_context`); no Figma variables/styles are defined in the file (`get_variable_defs` returned empty) — every value below is a literal, not a shared style, so this is the first place they become a named token.

Both frames use a flat Tailwind **slate** scale with no other hue — the wireframe is intentionally monochrome (no red/amber/green anywhere, including on the "Vencido"/"Fatal" status pills, which render in slate + an uppercase label instead of color). Applied to `apps/web/src/index.css`:

| Hex | Tailwind slate step | Token | Where it appears in the wireframe |
|---|---|---|---|
| `#f8fafc` | slate-50 | `--background` | page background |
| `#ffffff` | white | `--card` | header bar, stat cards, chart/breakdown cards, table rows |
| `#e2e8f0` | slate-200 | `--border` | subtle card/table borders, footer rule |
| `#f1f5f9` | slate-100 | `--secondary` / `--muted` | chip/pill fills, bar-chart track, avatar fill |
| `#94a3b8` | slate-400 | `--border-strong` / `--input` / `--ring` | buttons, the período selector, filter chip, avatar, badge outline — every *interactive/control* border, one visual step stronger than `--border` |
| `#64748b` | slate-500 | `--muted-foreground` | card eyebrow labels, secondary text |
| `#475569` | slate-600 | new `--chart-4` | the one data color used everywhere there's a chart: line stroke, bar fill, progress-bar fill |
| `#1e293b` | slate-800 | `--primary` | logo mark, "Prazos Críticos" headline-count badge, the "VENCIDO" status pill |
| `#0f172a` | slate-900 | `--foreground` | primary text |

`--border` (`#e2e8f0`) vs. the new `--border-strong` (`#94a3b8`) is a real distinction in both frames, not incidental: every structural divider (card outlines, table rules, footer rule) uses the subtle value, and every interactive or emphasis element (buttons, the período/filter chips, the avatar circle, the callout card, badge outlines) uses the stronger one. `--input`/`--ring` are set to the same `#94a3b8` since every bordered control in the wireframe already uses it. `--chart-1..3`/`--chart-5` extend `#475569`/`#94a3b8` into a full 5-step slate ladder (`#cbd5e1`→`#1e293b`) for future multi-series use — only `#475569` (chart-4) and `#94a3b8` (chart-2) are values the wireframe actually shows; the rest are a consistent extension, not independently confirmed. `--destructive` (`#dc2626`) is carried over unchanged from the prior stub theme — the wireframe has no color to source it from.

Dark mode isn't shown in either frame (no `.dark` variant was drawn); the `.dark` block in `index.css` is a derived inversion of the same slate scale, not extracted, and should be treated as provisional until someone actually designs a dark pass.

### Typography

Two families, used for two different jobs — every numeric/data value is set in a monospaced face, everything else in the UI sans:

- **Inter** (`Inter:Regular` / `Medium` / `Semi_Bold` / `Bold` / `Extra_Bold`) — all UI text: nav, labels, headings, card copy, table text.
- **Geist Mono** (`Geist_Mono:Regular` / `Medium` / `SemiBold` / `Bold` / `ExtraBold`) — every number: stat-card figures (`124`, `R$ 142.350,00`), the headline prazo count badge, dates (`20/10/2024`, `Em 2 dias`), chart axis labels (`Dia 1`…`Dia 30`), bar-chart unit counts (`160 un.`), percentages (`72%`), the donut center label (`80%`).

This replaces the scaffold's placeholder theme, which imported only `@fontsource-variable/geist` (Geist Variable, sans-only) and a default shadcn green `--primary` (`#16a34a`) — neither is used anywhere in the wireframe. `apps/web/package.json` now imports `@fontsource-variable/inter` and `@fontsource-variable/geist-mono` instead; `--font-sans`/`--font-mono` in `index.css` point at them. Any new component in this feature (and, going forward, stat/data displays elsewhere) should apply `font-mono` to numeric values per the split above rather than leaving everything in `font-sans`.

## Solution

New `reports` bounded context under `apps/web/src/modules/reports/` (naming settled — matches PLANNING §4's "Relatórios" heading and this repo's English-slug module convention), read-only, aggregating across `clients`, `matters`, `payments`, `deadlines`, `catalog` via their public controllers (no new tables, no direct cross-module repository access — same boundary rule as every other module, `eslint-plugin-boundaries`).

**Two screens, two routes** (decided 2026-09-09, screens-brief.md; route shape settled by the wireframe below): **Métricas** (stat cards + faturamento chart + breakdowns) and **Prazos** (deadlines agenda/list — the priority metric per §1 gets its own focal screen instead of sharing one generic "Painel"). Same bounded context/module either way. Prazos page ships as a list/agenda for MVP; a calendar grid (month/week, drag-drop) is deferred to v2 — no prior art for it in ManagerDesk's `dashboard.tsx`.

Report set (PLANNING §4, confirmed against the wireframes — matches exactly, no metric added or dropped), by page:

Métricas:
- Clientes ativos por status
- Matters por status
- Faturamento por período (reuse ManagerDesk's period-selector + area-chart pattern, adapted from `services`+`payments` to this project's `matters`+`payments`)
- Volume por item de catálogo
- Prazos vencendo/vencidos — teaser card only, links to the Prazos page, reuses that page's count (no duplicate query)

Prazos:
- Prazos próximos/vencidos (priority metric per §1 — reuses `deadlines` listing's overdue/vence-em-breve comparison already built in `deadlines-engine-alerts`, per that spec's "no separate report query — the full aggregate dashboard is step 6, out of scope here") as both the headline count and the agenda/list body

## User Stories

**Métricas page**

1. As any tenant member, I want a período selector (últimos 7/30/90 dias, últimos 6 meses, últimos 12 meses; default 30 dias) that re-scopes every period-bound metric on the page, so I can compare different windows without leaving the screen.
2. As any tenant member, I want a "Visualizar Painel de Prazos" link in the page header, so I can jump to the Prazos page without hunting for it.
3. As any tenant member, I want a **Clientes ativos** card showing the live count of `clients` where `status = ativo` (not period-scoped), so I know current active-client volume at a glance.
4. As any tenant member, I want a **Matters em andamento** card showing the count of `matters` where `status = em_andamento`, so I see current caseload without opening the matters list.
5. As any tenant member, I want a **Faturamento** card showing the sum of `payments.value` where `status = pago`, scoped to the selected período, in BRL, so I see period revenue without a manual report.
6. As any tenant member, I want an **A receber** card showing the sum of `payments.value` where `status = pendente` (not period-scoped — total outstanding), so I see total exposure at a glance.
7. As any tenant member, I want a **Prazos Críticos** teaser card (same count as the Prazos page headline) linking to that page, so I get an early warning without computing it twice.
8. As any tenant member, I want a **Faturamento no tempo** time series — one point per day in the selected período, y = sum of `payments.value` (status `pago`) that day — so I can see the revenue trend, not just a total.
9. As any tenant member, I want a **Matters por status** breakdown across `rascunho`/`em_andamento`/`concluido`/`arquivado`, tenant-scoped, so I see pipeline distribution.
10. As any tenant member, I want a **Volume por item de catálogo** breakdown (count of `matters` per `matter_catalog_items.name`, top N with an "outros" bucket for the rest), so I see which recurring service types drive the caseload.
11. As any tenant member, I want a **Clientes ativos por status** ratio (`ativo`/`inativo`), so I see client-base health at a glance.

**Prazos page**

12. As any tenant member, I want a headline count of `deadlines` where `status = pendente` and due within the alert window (5 dias úteis) or already overdue, so I immediately know how many things need action.
13. As any tenant member, I want the prazos below that headline grouped into **vencido / hoje / próximos**, each row showing matter (client + catalog item), descrição, due date, an overdue/vence-em-breve badge, and the `is_fatal` flag, so I can triage without opening each deadline.
14. As any tenant member, I want no período selector on this page — prazos is forward-looking (o que vence / já venceu), not a historical bucket — so the page doesn't imply a control that wouldn't apply to it.
15. As any tenant member, I want a "Ver todos os prazos catalogados" link to the existing `deadlines` listing screen, so this page stays an aggregate and doesn't duplicate that screen's full CRUD/filter surface.

## Implementation Decisions

- **Modules**: `apps/web/src/modules/reports/*` per the existing stub layout. `reports.repository.ts` runs the read-only aggregate queries against `clients`, `matters`, `payments`, `catalog`, `deadlines` directly for simple counts/sums, but the prazos headline/list computation is not reimplemented — it calls `deadlines.service.ts`'s existing public overdue/vence-em-breve comparison (same rule `deadlines-engine-alerts` already built for its own listing), never `deadlines.repository.ts` directly (PLANNING §6 cross-context rule, same pattern `deadlines-engine-alerts` used for its own `matters.uf` lookup). `components/` gets the two page components plus the shared header/nav.
- **Routes**: two routes, e.g. `/dashboard/metricas` and `/dashboard/prazos` (wouter, matching the rest of the app), not tabs on one route — the wireframe's "Métricas | Prazos" pair in the top bar are two separate frames with independent full-page layouts, not a tab-panel swap within one shell, so two routes matches what was actually drawn.
- **Nav shape — flagged, not fully resolved**: both wireframes share one top bar (logo mark, "Métricas"/"Prazos" links with the active one underlined, user chip) and no left sidebar. That's a real deviation from PLANNING §2/§3's plan to reuse ManagerDesk's `AppShell`/`panel-kit.tsx` "quase 1:1" — that shell is sidebar-based (`components/ui/sidebar.tsx`, `SidebarMenu` nav). `apps/web/src/components` has no `AppShell`/nav component yet (stub scaffold only per repo status), so this feature would be the first to build one either way. Worth deciding explicitly before implementation starts, since it's a whole-app nav-shape call, not just this feature's: does the reused shell become top-bar (matching this wireframe) or does the wireframe's nav get adapted into the sidebar (matching the PLANNING reuse plan)? Not decided here — pick one and build the shared nav component once, since both pages consume it identically.
- **Theme**: see "Design tokens (Figma)" above — `apps/web/src/index.css` and `apps/web/package.json` are already updated to the extracted slate palette + Inter/Geist Mono split as of this spec.
- **RBAC**: unresolved — carried from screens-brief.md, the wireframe doesn't show a `secretario` variant. PLANNING §8's base matrix is silent on "reports"; `payments` CRUD already excludes `secretario`. Decide during ticket breakdown whether Faturamento/A receber hide for that role (Prazos page has no `payments` data, so it needs no gating either way).
- **Empty/loading states**: unresolved — neither wireframe shows a zero-data or skeleton state. ManagerDesk's dashboard uses skeleton placeholders while queries resolve; carry that pattern, one variant per page, decided during ticket breakdown rather than invented here.

## Testing Decisions

- **`reports.repository.ts` aggregate queries**: integration-tested against a real disposable Postgres instance (same harness as other modules), covering tenant isolation on every count/sum and correct period-window filtering for Faturamento/faturamento-no-tempo.
- **Prazos headline/list**: no new computation to test — assert it's calling `deadlines.service.ts`'s existing overdue/vence-em-breve function rather than reimplementing the comparison (a regression here would silently diverge from the `deadlines` listing screen's own count).
- **Page-level UI**: no prior art for component-level tests in this repo (same gap noted in `clients-catalog-matters-crud`/`deadlines-engine-alerts`) — verify by running the dev server against seeded data: check every card/breakdown against known fixture totals, switch período on Métricas, confirm the Prazos grouping (vencido/hoje/próximos) and the two "ver todos"/teaser links navigate correctly.

## Out of Scope

- Calendar grid UI (month/week, drag-drop) on the Prazos page — v2.
- No drill-down/detail views beyond "ver todos" links to existing list screens (clients, matters, deadlines) — these pages aggregate, they don't duplicate CRUD.
- No date-range custom picker beyond the 5 fixed período buckets (Métricas page only — Prazos page has no período control at all).
- No export (CSV/PDF) — not mentioned in PLANNING §4.
- Assigning real semantic colors to status badges (vencido/hoje/em X dias/fatal) — the wireframe renders all of them in monochrome slate + an uppercase label; picking actual red/amber/etc. is a visual-design decision this wireframe doesn't make, not something to invent while wiring up the data.

## Further Notes

- Depends on `postgres-schema-rls`, `tenants-auth-invite`, `clients-catalog-matters-crud`, `deadlines-engine-alerts` — all `done`.
- The nav-shape tension (top bar per this wireframe vs. sidebar per PLANNING's ManagerDesk-shell reuse plan) is the one open item most likely to block ticket breakdown — resolve it first, since the shared header/nav component is a prerequisite for both pages.
- `--border-strong` is a new token, not part of the prior stub theme's shadcn-default set — it exists because both wireframes consistently use a stronger border on interactive/emphasis elements than on structural dividers; worth keeping that distinction as new UI gets built rather than collapsing back to a single `--border`.
