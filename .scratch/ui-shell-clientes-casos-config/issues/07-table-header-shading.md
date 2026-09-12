# 07: Shared data-table header shading

**What to build:** Every wireframed data table (`ClientsTable.tsx`, `MattersTable.tsx`, `MembersTable.tsx` under Configurações → Equipe) draws its header row with a light tint fill and a rule beneath it, separating it from the body rows. The current build renders all three header rows flush white, same as the rows below — find wherever the shared table-header styling lives (component or Tailwind class) and fix it once, not per-table.

Text case/labels are already correct (uppercase via CSS class per `02`'s precedent) — this is a background/border-only fix, no copy changes.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Clientes, Casos, and Configurações → Equipe table headers all show the shaded band + rule
- [x] Fixed at the shared level: no shared table component existed (each table hand-rolled its own `<thead>`), so added `TABLE_HEADER_ROW_CLASS` in new `components/ui/table.ts` and imported it into all three — one class definition, not three copy-pasted tweaks
- [x] No visual regression to header text case, column widths, or sort/filter controls already in these headers
- [x] `tsc --noEmit` clean, existing table component tests still pass (no dedicated component tests exist for these three tables; full `vitest run` — 101/101 — still passes)

## Comments

- 2026-09-12: `bg-muted/50` used for the tint (same token `Skeleton`/`MetricasPage.tsx`'s progress-bar background already use for a subtle fill), `border-b` kept for the rule.
