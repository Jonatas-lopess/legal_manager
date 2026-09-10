# 01: Nav shell + Métricas core stat cards

**What to build:** A shared top-bar nav (logo mark, "Métricas"/"Prazos" links with the active one underlined, user chip — per the wireframe's nav shape, confirmed 2026-09-10 over PLANNING §2's sidebar-reuse plan) wraps both dashboard routes. `/dashboard/metricas` renders with a período selector (últimos 7/30/90 dias, últimos 6 meses, últimos 12 meses; default 30 dias) and four live stat cards: **Clientes ativos** (count of `clients` where `status = ativo`, not período-scoped), **Matters em andamento** (count of `matters` where `status = em_andamento`, not período-scoped — matches `Clientes ativos`'s pattern), **Faturamento** (sum of `payments.value` where `status = pago`, scoped to the selected período, BRL), **A receber** (sum of `payments.value` where `status = pendente`, not período-scoped — total outstanding). New `apps/web/src/modules/reports/*` bounded context (controller/service/repository/schema) goes from stub to real here; `reports.repository.ts` queries `clients`/`matters`/`payments` via their public controllers, never their repositories directly (same cross-module boundary rule every other module follows).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Top-bar nav renders on both dashboard routes: logo, "Métricas"/"Prazos" links (active link underlined), user chip
- [ ] `/dashboard/metricas` route registered (wouter); `/dashboard/prazos` route registered and reachable via the nav link, even before `03` fills it in
- [ ] Período selector (5 buckets, default 30 dias) re-scopes `Faturamento`
- [ ] `Clientes ativos`, `Matters em andamento`, `A receber` render live, correct counts/sums, not affected by período selector
- [ ] `Faturamento` renders correct BRL sum for the selected período, updates when período changes
- [ ] `Faturamento`/`A receber` cards are hidden for the `secretario` role (matches `payments` CRUD's existing exclusion of that role, PLANNING §8); `Clientes ativos`/`Matters em andamento` remain visible to all roles
- [ ] Loading skeleton per card while queries resolve; zero-data tenant renders 0/BRL 0,00 on every card, not broken
- [ ] `reports.repository.ts` only reaches `clients`/`matters`/`payments` through their public controllers
- [ ] Integration test (real disposable Postgres, same harness as other modules): tenant isolation on every count/sum above, correct période-window filtering on `Faturamento`
