# 04: Prazos Críticos teaser on Métricas

**What to build:** A **Prazos Críticos** teaser card on `/dashboard/metricas` showing the same count as the Prazos page headline (`03`) — calling the same underlying function, no duplicate query — and linking to `/dashboard/prazos`.

**Blocked by:** `01`, `03`

**Status:** ready-for-agent

- [ ] Teaser card renders on Métricas, count matches the Prazos page headline exactly for the same tenant/data state
- [ ] No separate/duplicate query — teaser and Prazos headline share the same underlying call
- [ ] Clicking the teaser navigates to `/dashboard/prazos`
- [ ] Loading skeleton while resolving; zero-data tenant renders 0, not broken
