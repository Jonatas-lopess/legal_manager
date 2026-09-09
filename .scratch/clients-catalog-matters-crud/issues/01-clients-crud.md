# 01: Clients CRUD

**What to build:** Full CRUD for `clients` — create, edit, list/search (filterable by `ativo`/`inativo`), and soft-delete (`deleted_at`, hidden from default list but still fetchable by ID) — scoped to the acting tenant. Form ports `service-dialog.tsx`'s react-hook-form + `zodResolver` + BR-mask (`lib/masks.ts`) architecture for CPF/CNPJ and the new juridical fields (RG, endereço, estado civil, profissão, parte contrária, dados de procuração). Every create/update/soft-delete writes an `audit_log` row via the `audit` context.

**Blocked by:** `postgres-schema-rls` ticket 02 (`clients` table + RLS), `tenants-auth-invite` ticket 02 (session/route guard) — both external, from other feature tickets.

**Status:** done

- [x] Create/edit client succeeds with CPF/CNPJ masked + validated
- [x] List/search returns only the acting tenant's clients; cross-tenant list/read returns nothing
- [x] Filter by `ativo`/`inativo` works
- [x] Soft-delete sets `deleted_at`, excluded from default list, still fetchable by ID
- [x] Every create/update/soft-delete produces an `audit_log` row with the acting `user_id`
- [x] Test seam: `clients.service.ts` against real local Supabase stack (no mocked `supabase-js`)

## Comments

Implemented as specced, with three deviations worth recording for tickets 02-05 (`catalog`, `matters`, `tags`, `payments`), which share these same patterns:

- **Audit logging needs no app code.** `postgres-schema-rls` already installs `AFTER INSERT/UPDATE/DELETE` triggers on `clients` (and `matters`/`payments`) that write `audit_log` rows with `auth.uid()` automatically — confirmed by test (`clients.service.test.ts`'s last case queries `audit_log` directly). `clients.service.ts` does not call the `audit` context at all; doing so would double-write. `catalog`/`tags` have no such trigger, so if they ever need audit trails they *would* need an explicit write — but nothing in this spec's Testing Decisions asks for that.
- **Plain `<Dialog>` from `radix-ui`, not a `components/ui/dialog.tsx` wrapper**, matching `InviteUserDialog.tsx`'s existing pattern (tenants-auth-invite) — no dialog primitive existed yet and one caller doesn't justify adding a wrapper layer.
- **No `panel-kit.tsx` port** (`AppShell`/`StatusBadge`/`DebouncedSearch`/`InfiniteList`). That file (office_manager) is entangled with a full sidebar system, CSV import, `useDb`, and `useToast` — none of which exist here, and porting all of it for one list view was disproportionate. `ClientsTable.tsx` has its own small inline search/filter/table instead. `react-hook-form` + `@hookform/resolvers/zod` *were* added as new deps (per this spec's explicit call-out) for `ClientDialog`'s 13-field form + CPF/CNPJ/phone masking via `Controller`.

Manually verified in a real browser (Vite dev server + a seeded admin, Playwright-driven): login → Clientes → create with a valid CPF (masked + accepted) → edit → invalid-CPF rejected with inline message → soft-delete removes it from the default list. Zero console errors.

Found but out of scope: deleting a `tenants` row directly (raw SQL, not any app path) hits a pre-existing FK-ordering bug — the cascade-deleted `clients` row's `AFTER DELETE` audit trigger tries to insert into `audit_log` referencing the tenant that's mid-delete. No UI path deletes a tenant, so not fixed here; worth a note if a future ticket adds tenant deletion.
