# 11: Prazos page — rebuild as grouped table

**What to build:** `PrazosPage.tsx`'s agenda body is the wrong shape entirely against `prazos-agenda` (`4:164`). The wireframe is **one table**: a shaded header row (columns **CASO/MATTER (CLIENTE — DETALHE)** | **DATA FATAL** | **SITUAÇÃO** | **RELEVÂNCIA**) with vencido/hoje/próximos rendered as in-table group rows (small accent bar + label), every matter's row spanning the table's full width. The build currently renders three separate boxed cards side by side (one per bucket) — each only ~330px wide, narrow enough that "cliente — item de catálogo" wraps 3 lines while the due-date/status/fatal badges get squeezed onto the same cramped line next to it.

Rebuild the body as one table matching that column set. Row content itself is already correct and needs no change — `03`'s matter-scoped Prazos card grouping logic (vencido/hoje/próximos via the shared `deadlines.service.ts` bucketing) is the same data this page already renders, just laid out as cards instead of table rows:

- SITUAÇÃO column: bucket-derived label (`VENCIDO`/`HOJE`/`EM N DIAS`-style, matching what's already computed), not the raw `deadlines.status` enum value.
- RELEVÂNCIA column: `● FATAL` when `is_fatal`, otherwise the deadline's own tag label if it has one, plain "Comum" text otherwise (per the frame — not a pill, just text).
- DATA FATAL column: existing date-formatting rules apply unchanged (no time-of-day invented for "Hoje", per `03`'s own rule).

Also restore three page-level pieces the current build drops entirely:

- Page subtitle under the "Prazos" title: "Acompanhamento de obrigações processuais urgentes".
- "Filtrado por: Próximos 5 dias ou já vencidos" chip, top-right of the page header (informational — this is not the "período selector" `dashboard-reports`' own spec explicitly ruled out for this page; it's a static label describing what the fixed 5-day/overdue window already shows, not a new interactive control. Don't add a control behind it — same "no invented control" rule that ruled out a período selector here in the first place).
- Headline card body sentence: pair the count with "Existem N prazos processuais que expiram em até 5 dias úteis ou que já superaram a data fatal de entrega" (or the app's own phrasing of the same fact — count + window description), not just the bare "Prazos Críticos" label. "Ver todos os prazos catalogados" moves from a top-right text link in the page header to a centered bordered button below the table.

Note for context: `01`'s 2026-09-12 Comments entry claims "no drift found" for this page, but that pass checked the wireframe's **text description** only and explicitly flagged that it never re-pulled the actual frame. This ticket is that re-pull, corrected.

**Blocked by:** `07` (reuses the shared table-header shading this ticket's new table needs)

**Status:** ready-for-agent

- [ ] Agenda body is one table (shaded header row, 4 columns as above), not three side-by-side cards
- [ ] vencido/hoje/próximos render as in-table group rows, not separate card containers
- [ ] No more 3-line name-wrapping / cramped date-badge crowding at normal viewport widths
- [ ] Page subtitle restored
- [ ] "Filtrado por: ..." chip restored, top-right, purely informational (no new control)
- [ ] Headline card shows the full sentence, not just the bare label
- [ ] "Ver todos os prazos catalogados" is a centered button below the table, not a header text link
- [ ] `tsc --noEmit` clean, `reports`/`deadlines` test suites still pass (no data-layer change expected, layout only)
- [ ] Verified by screenshot against `4:164` with seeded demo data (empty/near-empty data was misleading in the 2026-09-12 review — use a populated fixture)
