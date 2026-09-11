# 03: Casos page relayout + new matter-scoped Prazos card

**What to build:** Two wireframe frames (`casos-lista` node `18:120`, `casos-detalhe` node `18:223`), one ticket since they're the same nav flow (list → detail). Corrected against `get_metadata` on the real frames 2026-09-11 (spec.md's "Fidelity check" — this ticket implements the corrected version, not the original brief).

## `casos-lista` (relayout `MattersTable.tsx`, no new data logic)

- Header row: title "Casos" + search ("Buscar por número ou título...") + status filter ("Todos os status") + client filter ("Todos os clientes") + "Novo caso" button, one row above a table card (same card-wrapping change as `02`)
- Table columns: **CLIENTE** | **ITEM DE CATÁLOGO / PROCESSO** | **UF / COMARCA / MUNICÍPIO** | **STATUS** (pill) | **AÇÕES**. The second column's drawn examples ("Recurso Trabalhista - Horas Extraordinárias", "Contestação Cível - Indenização Material") read as a composed label, not a bare catalog-item name — compose it the same way this codebase's existing `matterLabel`-style helpers do (`DeadlinesTable.tsx`/`DeadlineTagPicker.tsx`: catalog item name + a short piece of `description`), don't just print `matterCatalogItemId`'s name alone.
- AÇÕES column is a bare chevron (›) — whole row is a link to `/matters/:id`, no separate edit/archive icons here (those live inside `casos-detalhe`)
- Status pill values match the enum exactly as drawn: EM ANDAMENTO, RASCUNHO, CONCLUÍDO, ARQUIVADO
- Empty/loading states, same pattern as `02`

## `casos-detalhe` (relayout `MatterDetailView.tsx`)

- **Page title**, not present today: `"{Cliente} — {mesmo rótulo composto da coluna 'Item de catálogo / Processo' de casos-lista}"` (e.g. `"Silva & Associados — Recurso Trabalhista"`). Reuse the same composed-label helper as `casos-lista`'s second column — one helper, two call sites, not two copies.
- Back button ("← Casos") + "Editar caso" button row, then stacked full-width cards in this order:

  1. **Dados do processo** — eyebrow label + status pill in the same header row (not stacked). Fields: UF, Comarca, Município, **Número CNJ** (new — see "Schema change" below), then Descrição on its own full-width row below (not a 2-col grid item like today's implementation — it reads as a distinct "DESCRIÇÃO DETALHADA" block under the UF/Comarca/Município/CNJ row).

  2. **Prazos — NEW CARD**, not present today. Eyebrow "PRAZOS RELACIONADOS" + a `"Total: N prazos mapeados"` counter on the same header row. Deadlines scoped to this matter only (`listDeadlines({ matterId: matter.id })` — filter already exists). Grouped **vencido / hoje / próximos** — **do not call `dueDateHighlight` and stop there**: that only splits vencido/vence_em_breve/on_track, not the 3-way split this card needs. The exact vencido/hoje/próximos bucketing already exists in `reports.service.ts` (the `getPrazosCriticos`-adjacent function: filter through `dueDateHighlight` keeping vencido/vence_em_breve, then bucket by comparing `dueDate` to today's local date). **Extract that bucketing into `deadlines.service.ts`** (re-export via `deadlines.controller.ts`, same precedent `dueDateHighlight` itself already set per `dashboard-reports/01`'s Comments), add an optional `matterId` param, and have both `reports.service.ts` and this new card call the shared version — this also pays down the "reports.service.ts duplicates deadlines.service.ts's date-arithmetic" debt `dashboard-reports`' code-review pass already flagged. Confirm `reports`' existing tests still pass after the move (logic relocates, doesn't change).

     Per row: descrição, due date, status pill, one badge slot, "Marcar cumprido" action (`markDeadlineCumprido`, already exported):
     - Due date text differs by bucket: absolute date for vencido (`18/10/2024`), `"Hoje"` for hoje (**no time-of-day** — `deadlines.dueDate` has no time component, the frame's `"(17:00h)"` isn't backed by real data, don't invent one), `"Em N dias"` for próximos.
     - Status pill: **`ATRASADO`** for vencido rows, **`PENDENTE`** for hoje/próximos rows — not the deadline's raw `status` enum value, a bucket-derived label (vencido→ATRASADO reads distinctly from the group header's own "VENCIDO" label — keep both, they're not redundant in the drawn frame).
     - Badge slot: **`● FATAL`** when `isFatal`; otherwise the deadline's own tag chip if it has one (reuse the tag-chip rendering `TagPicker`/`DeadlineTagPicker` already have), nothing if it has neither. **Not** a counting-mode chip — `dias_uteis`/`dias_corridos` doesn't appear anywhere on this card.

     Inline "+ Novo prazo" button/form at the bottom of the card — reuse `DeadlineDialog.tsx`'s field set (descrição, data início, dias, modo de contagem, fatal toggle), pre-filled with this `matterId`, not a standalone dialog rebuild.

  3. **Tags** ("TAGS DO CASO") — unchanged, existing `TagPicker`, just relabel the card header to match the drawn eyebrow text.

  4. **Financeiro** ("FINANCEIRO E PAGAMENTOS") — table columns **PARCELA/DESCRIÇÃO | VALOR | STATUS | AÇÃO** (today's `PaymentPanel` has no description column at all — see "Schema change" below). Action column text is direction-specific, not a generic toggle: **"Marcar como pago"** for pendente rows, **"Estornar"** for pago rows (currently both say "Marcar como {pendente|pago}" — fix the copy to match). Create row: description text input ("Nova descrição de pagamento...") + value input + "Registrar pagamento" — still hidden entirely for `secretario`.

- Soft-deleted banner (existing `deletedAt` check) stays as-is, just restyle to match the card pattern.

## Schema change (additive, two nullable columns — see spec.md fidelity check points 1–2)

- `matters.numero_cnj text NULL` — new migration, `matters.schema.ts`/`.service.ts`/`.repository.ts`/`.controller.ts` updated to carry it through create/update/read, `MatterDialog.tsx` gets the field.
- `payments.description text NULL` — new migration, same plumbing through `payments.*`, `PaymentPanel.tsx`'s create form gets the field. **Free text only** — no parcela-number/total columns, no split logic, no linked-payment-group concept. `payments.value`/`status` behavior is otherwise unchanged (still "sem split" per PLANNING §4, still implicitly `pendente` on create).

**Blocked by:** `01`

**Status:** ready-for-agent

- [ ] `casos-lista`: header row + table columns match wireframe (including the composed "Item de catálogo / Processo" label), row click → detail
- [ ] `casos-lista`: empty/loading states implemented
- [ ] `casos-detalhe`: page title composed from client name + the shared composed-label helper
- [ ] `casos-detalhe`: cards stacked full-width in the order above, Dados do processo card includes Número CNJ + a full-width Descrição row
- [ ] Migration: `matters.numero_cnj`, `payments.description`, both nullable, both plumbed through schema/service/repository/controller/UI
- [ ] New Prazos card: shows only this matter's deadlines, grouped vencido/hoje/próximos via the shared bucketing helper moved into `deadlines.service.ts` (not reimplemented, not left duplicated in `reports.service.ts`)
- [ ] Prazos card: due-date text matches the per-bucket format above (no fabricated time-of-day), status pill ATRASADO/PENDENTE, badge slot is FATAL-or-tag-chip (not a counting-mode chip)
- [ ] Prazos card: "Marcar cumprido" wired, inline create reuses `DeadlineDialog.tsx`'s field set, pre-fills `matterId`
- [ ] Tags card relabeled, Financeiro card has the new description column + direction-specific action copy ("Marcar como pago" / "Estornar")
- [ ] `reports.service.ts`'s existing Prazos-críticos tests still pass after the bucketing helper moves to `deadlines.service.ts`
- [ ] Existing `matters`/`deadlines`/`tags`/`payments` test suites extended (not just passing unchanged) to cover the two new nullable fields
- [ ] Dev server verified: create/edit matter with Número CNJ, the new Prazos card's grouping/badges/mark-cumprido, Financeiro's new description field and direction-specific action copy (boot + click-through)
