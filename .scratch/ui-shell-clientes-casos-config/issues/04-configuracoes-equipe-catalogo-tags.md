# 04: Configurações page — Equipe, Catálogo, Tags tabs

**What to build:** New `/settings` route (reachable only from the avatar dropdown built in `01`, no top-nav entry), frame `configuracoes` node `18:374`. Corrected against `get_metadata` on the real frame 2026-09-11 — see spec.md's "Fidelity check" point 5: the frame only fully drew the **Equipe** tab; Catálogo/Tags/Auditoria are represented by one compact "OUTRAS CONFIGURAÇÕES (PREVISÃO MVP)" strip below it, not three more full tab mockups. This ticket builds Equipe as drawn (full table) and Catálogo/Tags in that same compact shape — not the heavier filterable-table UI an earlier draft of this ticket assumed.

Page shell: title "Configurações" + horizontal tab strip (Equipe | Catálogo | Tags | Auditoria — this ticket covers the first three, `05` covers Auditoria), tab content in a card below.

## Tab "Equipe" (full mockup — build it as drawn)

Relocate `MembersTable.tsx`'s table here, header copy per the frame: "Equipe do Escritório" / "Controle permissões e acessos de advogados e secretários", "Convidar usuário" button top-right (admin-only, existing `InviteUserDialog.tsx`, unchanged).

Table columns: **NOME DO PROFISSIONAL | E-MAIL DE ACESSO | FUNÇÃO | AÇÕES**. Role pill text: keep the existing combined-form labels (`"Admin"`, `"Advogado(a)"`, `"Secretário(a)"`) — the frame shows gendered pills per example person (ADVOGADA vs ADVOGADO, SECRETÁRIA vs SECRETÁRIO) but that's invented-name flavor, not a real requirement (`users` has no gender field, `userRoleEnum` has exactly three values). Don't add a gender field.

**New capability, not in `tenants.*` today**: AÇÕES column has an "Excluir" text action per row — `tenants.controller.ts` currently exports only `listMembers`/`inviteUser`, nothing to remove a member. Add it:
- New `removeMember(userId)` in `tenants.service.ts`/`.repository.ts`, exported via `tenants.controller.ts` (same public-API-only rule every other module follows).
- Admin-only (same gate `inviteUser` already has).
- Two guardrails to decide and implement (spec.md's RBAC section flags both): **no removing yourself**, **no removing the tenant's last `admin`**. Pick disable-in-UI vs. server-side rejection-with-message for each, document the choice in this ticket's Comments.
- Check `supabase/functions/tenants/service.ts` (the invite Edge Function) for how it already splits writes between the Supabase Auth user and the `public.users` row before deciding whether "remove" deletes the `users` row only or the Auth user too — match whatever precedent that file already set rather than inventing a new split.
- Confirmation before the actual delete call (destructive, irreversible) — a simple confirm dialog is enough, no need for a typed-confirmation pattern.

## Tab "Catálogo" (compact — matches the drawn preview, not a full table)

Header "CATÁLOGO DE DEMANDAS". List format per the frame: `"· {nome} — Criado em {data}"` per line (mono date), not a column table with a header row. Add/edit/delete controls still needed (backend supports all three via `catalog.controller.ts`, already real) — keep them small/inline (e.g. a trailing edit/delete icon pair per line) rather than a dedicated AÇÕES column, matching how compact the drawn preview is. "Novo item" affordance opens a one-field form (nome only — `CreateCatalogItemInput` has no other fields).

## Tab "Tags" (compact — matches the drawn preview, not a per-row table)

Header "CADASTRO DE TAGS GERAIS". Render as an inline chip cloud — same visual family as `casos-detalhe`'s "TAGS DO CASO" row (`03`), each chip showing the tag's name against its stored color — not a table with a separate color-swatch column. "+ Adicionar tag" chip at the end opens a form: nome, color picker. Edit/delete per chip (backend supports both via `tags.controller.ts`, already real) — click-to-edit on the chip itself is enough, no separate actions column. Deleting a tag here follows whatever cascade `tags.service.ts` already implements for `matter_tags`/`deadline_tags` — don't add new cleanup logic.

**Blocked by:** `01`

**Status:** ready-for-agent

- [ ] `/settings` route registered, reachable only from the avatar dropdown, tab strip renders Equipe/Catálogo/Tags/Auditoria (Auditoria tab content stubbed here, filled by `05`)
- [ ] Equipe tab: table + copy match the frame (NOME DO PROFISSIONAL/E-MAIL DE ACESSO/FUNÇÃO/AÇÕES), admin-only invite gate intact, role pills keep existing combined-form labels
- [ ] New `removeMember` in `tenants.*` (service/repository/controller), admin-only, both guardrails (no self-removal, no removing the last admin) implemented and decided per the Comments note above
- [ ] Removal matches the invite Edge Function's existing Auth-vs-`users`-row precedent, confirm dialog before delete
- [ ] Catálogo tab: compact `· nome — Criado em {data}` list, inline edit/delete, "Novo item" one-field form — no filter UI, no column-header table
- [ ] Tags tab: chip cloud with color, inline edit/delete per chip, "+ Adicionar tag" — no filter UI, no column-header table
- [ ] No change to `catalog.*`/`tags.*` service/repository/controller — UI-only for those two tabs
- [ ] Existing `catalog`/`tags`/`tenants` test suites pass; new `removeMember` integration-tested (real disposable Postgres) for admin-only gate + both guardrails
- [ ] Dev server verified: all three tabs' flows work, admin-only gates hold for non-admin, removal guardrails actually block self-removal and last-admin removal (boot + click-through)
