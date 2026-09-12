# 07: Shared data-table header shading

**What to build:** Every wireframed data table (`ClientsTable.tsx`, `MattersTable.tsx`, `MembersTable.tsx` under Configurações → Equipe) draws its header row with a light tint fill and a rule beneath it, separating it from the body rows. The current build renders all three header rows flush white, same as the rows below — find wherever the shared table-header styling lives (component or Tailwind class) and fix it once, not per-table.

Text case/labels are already correct (uppercase via CSS class per `02`'s precedent) — this is a background/border-only fix, no copy changes.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Clientes, Casos, and Configurações → Equipe table headers all show the shaded band + rule
- [ ] Fixed at the shared level (one change, not three copy-pasted tweaks) if a shared table pattern exists; if these three tables don't actually share one today, note that and fix each, flagging the duplication for a follow-up
- [ ] No visual regression to header text case, column widths, or sort/filter controls already in these headers
- [ ] `tsc --noEmit` clean, existing table component tests still pass
