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

**Status:** done

- [x] Agenda body is one table (shaded header row, 4 columns as above), not three side-by-side cards
- [x] vencido/hoje/próximos render as in-table group rows, not separate card containers
- [x] No more 3-line name-wrapping / cramped date-badge crowding at normal viewport widths (full-width table row per matter, no ~330px card constraint)
- [x] Page subtitle restored
- [x] "Filtrado por: ..." chip restored, top-right, purely informational (no new control)
- [x] Headline card shows the full sentence, not just the bare label
- [x] "Ver todos os prazos catalogados" is a centered button below the table, not a header text link
- [x] `tsc --noEmit` clean, `reports`/`deadlines` test suites still pass
- [x] Reviewed against `cap1.png` (a rendered screenshot of this exact page, dropped in the repo root) instead of a live `4:164` screenshot — no browser/screenshot tool in this environment (same caveat ticket `06` and `01`'s dev-server verification flagged)

## Comments

- 2026-09-12: `cap1.png` (untracked file at repo root) turned out to be a rendered reference of this exact page/data shape — used it as the literal pixel target instead of re-deriving column meaning from prose alone. It clarified that SITUAÇÃO (VENCIDO/HOJE/EM N DIAS) and DATA FATAL are two *different* pieces of information, not the same text twice: DATA FATAL is `MatterPrazosCard.tsx`'s `dueDateText` shape (absolute date for vencido, "Hoje" for hoje, "Em N dias" for próximos — duplicated locally, same per-file-duplication convention as its `roleLabels`/`BADGE_CLASS` siblings), SITUAÇÃO is the bucket name itself in that same style, rendered as this app's usual monochrome pill.
- One small deviation from "no data-layer change expected, layout only": RELEVÂNCIA's tag label needed each row's tags, which `PrazoRow` didn't carry — added one `listTagsForDeadlines(ids)` call (an already-exported `tags.controller.ts` function, same cross-module-read boundary `getPrazosCriticos` already uses for matters/clients/catalog) in the page component. No `reports`/`deadlines`/`tags` service or schema code touched.
- The reference's darker "VENCIDO" vs. lighter "HOJE"/"EM N DIAS" pill shading was not reproduced — this app's established convention (`BADGE_CLASS`/`STATUS_PILL_CLASS` everywhere else) is one uniform monochrome pill regardless of value, never a per-value intensity/color difference; kept that convention instead of the screenshot's two-tone treatment.
