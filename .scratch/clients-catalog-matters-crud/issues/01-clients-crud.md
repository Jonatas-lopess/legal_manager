# 01: Clients CRUD

**What to build:** Full CRUD for `clients` — create, edit, list/search (filterable by `ativo`/`inativo`), and soft-delete (`deleted_at`, hidden from default list but still fetchable by ID) — scoped to the acting tenant. Form ports `service-dialog.tsx`'s react-hook-form + `zodResolver` + BR-mask (`lib/masks.ts`) architecture for CPF/CNPJ and the new juridical fields (RG, endereço, estado civil, profissão, parte contrária, dados de procuração). Every create/update/soft-delete writes an `audit_log` row via the `audit` context.

**Blocked by:** `postgres-schema-rls` ticket 02 (`clients` table + RLS), `tenants-auth-invite` ticket 02 (session/route guard) — both external, from other feature tickets.

**Status:** ready-for-agent

- [ ] Create/edit client succeeds with CPF/CNPJ masked + validated
- [ ] List/search returns only the acting tenant's clients; cross-tenant list/read returns nothing
- [ ] Filter by `ativo`/`inativo` works
- [ ] Soft-delete sets `deleted_at`, excluded from default list, still fetchable by ID
- [ ] Every create/update/soft-delete produces an `audit_log` row with the acting `user_id`
- [ ] Test seam: `clients.service.ts` against real local Supabase stack (no mocked `supabase-js`)
