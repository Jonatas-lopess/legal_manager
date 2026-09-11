# 04: Prazos Críticos teaser on Métricas

**What to build:** A **Prazos Críticos** teaser card on `/dashboard/metricas` showing the same count as the Prazos page headline (`03`) — calling the same underlying function, no duplicate query — and linking to `/dashboard/prazos`.

**Blocked by:** `01`, `03`

**Status:** done

- [x] Teaser card renders on Métricas, count matches the Prazos page headline exactly for the same tenant/data state
- [x] No separate/duplicate query — teaser and Prazos headline share the same underlying call
- [x] Clicking the teaser navigates to `/dashboard/prazos`
- [x] Loading skeleton while resolving; zero-data tenant renders 0, not broken

## Comments

Implemented alongside `01`/`02`/`03` in one pass — see `01`'s Comments for the full implementation summary, verification, and the 2026-09-11 code-review pass. The teaser card calls `getPrazosCriticos` (`03`'s own function), same instance the Prazos page headline uses — no separate query.
