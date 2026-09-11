# 05: Configurações page — Auditoria tab (new `audit` module)

**What to build:** The one real new backend slice in this feature. `apps/web/src/modules/audit/*` is a full stub today (`export {}` in all four files) — no migration needed, though: `audit_log` (id, tenant_id, user_id, action `insert`/`update`/`delete`, entity, entity_id, created_at), its RLS policy (`audit_log_select_own_tenant` — any `authenticated` tenant member, no role restriction), and the write-triggers on `clients`/`matters`/`payments` all already shipped in `postgres-schema-rls`'s `04-payments-audit-log.md`.

**Corrected against `get_metadata` on the real `configuracoes` frame (node `18:374`) 2026-09-11** — see spec.md's "Fidelity check" point 5: the frame does not draw a Data/Hora/Usuário/Ação/Entidade/ID column table. It draws one compact example line under "OUTRAS CONFIGURAÇÕES (PREVISÃO MVP)" → "REGISTRO DE AUDITORIA": `"· 22/10 14:02h | Dr. Marcos | Criou Caso #1002"` — a composed narrative sentence (date/time | actor | verb + entity + short id), not separate columns. Build the tab in that shape: a reverse-chronological list of narrative lines, not a data grid.

- `audit.schema.ts`: `AuditLogEntry` type (id, action, entity, entityId, createdAt, actor: `{ id, name, email } | null` — `user_id` is nullable/`SET NULL` on user deletion, handle that case) + a `ListAuditLogFilter` (entity?, action?, dateFrom?, dateTo?) — the filter type is still worth having even though the drawn frame shows no filter UI (see below)
- `audit.repository.ts`: one query joining `audit_log` to `users` on `user_id` (same join shape `tenants.service.ts`'s `listMembers` already does for `name`/`email`) — tenant scoping comes from RLS, don't add a redundant `tenant_id` filter in the query itself (matches every other repository's existing convention)
- `audit.service.ts` / `audit.controller.ts`: `listAuditLog(filter?)`, thin passthrough
- **Tab "Auditoria"** in `configuracoes` (stub left by `04`): read-only, reverse-chronological list of composed lines — `"{data curta} {hora}h | {nome do ator, ou "—" se null} | {verbo} {entidade no singular, PT} #{id curto}"`. Verb per action: `insert`→"Criou", `update`→"Editou", `delete`→"Excluiu" (match the frame's "Criou Caso #1002" phrasing). Entity label singular PT per table: `clients`→"Cliente", `matters`→"Caso", `payments`→"Pagamento". Short id: first 4–6 chars of the UUID is fine — there's no sequential per-entity number in this schema, `#1002` in the frame is invented example flavor, don't add one.
- No create/edit/delete controls anywhere on this tab — pure log, matches the DB grant (no insert/update/delete grant on `audit_log`, only the trigger writes it).
- **Beyond what's drawn, added for usability** (explicitly not a fidelity item — the frame shows zero filter UI on its one-line example): an entidade/ação/date-range filter above the list once there's enough log volume to need one. Build it, but don't let it drive the row format above away from the narrative-line shape the frame actually drew.

**RBAC — decide before building**: RLS allows every tenant member to `SELECT` `audit_log`, but the feature exists for LGPD/sigilo-profissional accountability (`postgres-schema-rls`'s framing). Pick one and document the choice in this ticket's Comments when done:
  - (a) app-layer-restrict the tab to `admin` only (same pattern `payments`/`InviteUserDialog` already use for role gating — check `getCurrentUser()`/`user?.role` before rendering), or
  - (b) leave it visible to every role, matching what RLS actually permits.

Leaning (a), but this ticket is where it actually gets decided, not before.

**Blocked by:** `01`, `04` (needs the Configurações tab shell/stub `04` builds)

**Status:** ready-for-agent

- [ ] `audit.schema.ts`/`repository.ts`/`service.ts`/`controller.ts` filled in from stub, following this module's own cross-module boundary rule (controller is the only public surface)
- [ ] `listAuditLog` joins `users` for actor name/email, handles `user_id IS NULL` (deleted user) gracefully
- [ ] No new migration — confirm `audit_log`/RLS/triggers already present (`postgres-schema-rls`) before writing anything DB-side
- [ ] Auditoria tab: reverse-chronological narrative-line list (`{data} {hora}h | {ator} | {verbo} {entidade} #{id curto}`), no write controls
- [ ] Verb/entity mapping matches the table above (Criou/Editou/Excluiu; Cliente/Caso/Pagamento), no invented sequential id — short UUID prefix only
- [ ] Entidade/ação/date-range filter added above the list (usability addition, not a fidelity item) without changing the row format to a column table
- [ ] RBAC decision made and documented in Comments below (admin-only vs. all-roles)
- [ ] Integration test (real disposable Postgres, same harness as other modules): tenant isolation on `listAuditLog`, a seeded write to `clients`/`matters`/`payments` produces the expected log row
- [ ] `tsc --noEmit` clean, `vitest run` passing including the new `audit` suite
- [ ] Dev server verified: Auditoria tab renders real narrative-line rows after seeding a write elsewhere in the app, filter works, RBAC gate (whichever chosen) holds (boot + click-through)
