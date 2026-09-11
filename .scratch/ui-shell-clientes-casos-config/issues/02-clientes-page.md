# 02: Clientes page — relayout to `clientes-lista`

**What to build:** No new data logic — `ClientsTable.tsx`/`ClientDialog.tsx` already implement full CRUD (`clients.controller.ts`, done). This ticket relayouts the existing screen to match the `clientes-lista` wireframe's structure (frame node `18:7`, confirmed against `get_metadata` 2026-09-11 — matches this ticket's original plan almost exactly, unlike `03`/`04`/`05`): header row (title + search "Buscar por nome ou documento..." + status filter "Todos os status" + "Novo cliente" button, all in one row, `border-strong` styling on the interactive controls per the shared token table) sitting above a table card (not a bare `<table>` — wrap in the `Card` pattern `MatterDetailView.tsx` already uses).

- Table columns, in order (uppercase header labels per the frame): NOME / RAZÃO SOCIAL | CPF/CNPJ (single column — show whichever of the two is set, PF shows CPF, PJ shows CNPJ) | TELEFONE | E-MAIL | STATUS (pill) | AÇÕES (edit + archive icons, both present per row in the frame)
- Status pill: monochrome slate + uppercase label ("ATIVO"/"INATIVO"), same rule as every other pill in this app — do not invent a color
- Archived (soft-deleted, `deletedAt` set) rows render visually muted (lower opacity or `text-muted-foreground`), not hidden — they're still in the filtered list when `status=inativo` is selected
- Empty state (zero clients for the tenant): centered message + "Novo cliente" CTA, not a bare empty table
- Loading state: skeleton rows (reuse `components/ui/skeleton.tsx`, same one `dashboard-reports` cards use), not the current bare "no render" gap
- Create/edit dialog fields, in this order: nome, cpf, cnpj, rg, data de nascimento, telefone, e-mail, endereço, estado civil, profissão, parte contrária, procuração, observações — check `ClientDialog.tsx`'s current field order against this list and reorder if it's drifted (the wireframe fixes an order; the component predates it)

**Blocked by:** `01` (mounts under the unified shell; also avoids double-touching `App.tsx`'s route wiring)

**Status:** ready-for-agent

- [ ] Header row layout matches wireframe: title, search, status filter, "Novo cliente" — one row, not stacked
- [ ] Table columns match the order above, CPF/CNPJ collapsed to one column
- [ ] Status pill monochrome + uppercase, archived rows visually muted
- [ ] Empty state and loading skeleton implemented (currently missing/bare)
- [ ] `ClientDialog.tsx` field order matches the wireframe
- [ ] No change to `clients.controller.ts`/`clients.service.ts`/`clients.repository.ts` — this ticket touches `components/` only
- [ ] Existing `clients` test suite still passes unchanged (relayout shouldn't touch tested behavior, only markup/classes)
- [ ] Dev server verified: search, status filter, create, edit, archive all still work after relayout (boot + click-through)
