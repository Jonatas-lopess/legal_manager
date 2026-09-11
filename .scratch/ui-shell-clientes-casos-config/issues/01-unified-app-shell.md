# 01: Unified app shell — top bar everywhere, avatar dropdown

**What to build:** One shared shell component (replaces both `AppShell`'s current `<header>` in `App.tsx` and `DashboardNav.tsx` — merge into one, don't keep two implementations) renders on every authenticated route, not just `/dashboard/*`. Visual shape matches `DashboardNav.tsx`'s existing top bar (logo, active-underline nav links, right-side icon cluster) — that's the wireframe-confirmed shape (`metricas-dashboard`/`prazos-agenda`), now extended app-wide per `clientes-lista`/`casos-lista`/`casos-detalhe`/`configuracoes`.

- Nav links: `Clientes` (→ `/clients`) | `Casos` (→ `/matters`) | `Métricas` (→ `/dashboard/metricas`) | `Prazos` (→ `/dashboard/prazos`) — active link underlined, same `aria-current="page"` pattern `DashboardNav.tsx` already has.
- Right side: `NotificationsDropdown` (unchanged, keep as its own icon) + avatar. Avatar becomes a real dropdown trigger (today it's a static `<div>` in `DashboardNav.tsx`, absent entirely in `AppShell`'s header) — no shared `components/ui/dropdown-menu.tsx` exists yet in this repo, use `radix-ui`'s `DropdownMenu` primitive directly (same direct-import convention `InviteUserDialog.tsx` uses for `Dialog`) or a hand-rolled open-state popover matching `NotificationsDropdown.tsx`'s existing pattern — pick one, don't build both.
- Avatar dropdown menu items: **Configurações** (→ `/settings`, new route ticket `04`/`05` fill in), **Sair** (existing `logout()` + `refresh()` call, moved off the standalone `Button` both shells currently render).
- `App.tsx`'s `moduleRoutes` array (7 entries: Clientes/Catálogo/Casos/Prazos/Financeiro/Auditoria/Painel) is deleted — the new nav links above are hardcoded in the shell component, not generated from a route list (that list mixed real routes with 3 that were always stubs; no reason to keep a generic map for 4 fixed links).
- `/` (root) redirects to `/dashboard/metricas` (wouter `<Redirect>` or equivalent) instead of rendering `MembersTable` — Equipe moves under Configurações in `04`, so root has nothing left to show.
- `/payments` top-level stub route (`<div>Financeiro</div>`) is deleted, no replacement — payments stay matter-scoped only (`PaymentPanel` inside `casos-detalhe`, ticket `03`).
- `/deadlines` route stays registered (unchanged, `DeadlinesTable` untouched) but loses its nav entry — still reachable via `PrazosPage.tsx`'s existing "Ver todos os prazos catalogados" link.
- While rebuilding the shell, do a structural fidelity pass on `MetricasPage.tsx`/`PrazosPage.tsx` against `metricas-dashboard`/`prazos-agenda` (this is the original complaint that kicked off this feature: current layout drifted from the wireframe) — fix anything that's diverged now that you're touching this component anyway; don't open a second ticket for it.

**Blocked by:** None (can start immediately — this is the prerequisite every other ticket in this feature mounts under)

**Status:** ready-for-agent

- [ ] One shell component renders the top bar on every authenticated route (`/clients`, `/matters`, `/matters/:id`, `/dashboard/metricas`, `/dashboard/prazos`, `/settings` once `04` adds it) — `AppShell`'s old header and `DashboardNav.tsx` are gone, not both kept
- [ ] Nav links: Clientes | Casos | Métricas | Prazos, active one underlined + `aria-current="page"`
- [ ] Avatar is a working dropdown trigger (not a static div): opens Configurações/Sair menu, closes on outside click or item select
- [ ] "Sair" now lives only in the avatar menu — no standalone logout button left over in the shell
- [ ] `moduleRoutes` deleted from `App.tsx`; nav links are hardcoded in the shell
- [ ] `/` redirects to `/dashboard/metricas`
- [ ] `/payments` stub route removed
- [ ] `/deadlines` route still registered and reachable from `PrazosPage.tsx`'s "ver todos" link, just no nav entry
- [ ] `MetricasPage.tsx`/`PrazosPage.tsx` reviewed against their wireframe frames for structural drift, fixed where found
- [ ] `tsc --noEmit` clean, existing `reports`/`deadlines`/`tenants` test suites still pass (route/redirect changes shouldn't break anything asserting on `/`)
- [ ] Dev server boots clean, every route above verified reachable (boot + click-through, no browser/screenshot tool — same caveat `dashboard-reports/01` flagged)
