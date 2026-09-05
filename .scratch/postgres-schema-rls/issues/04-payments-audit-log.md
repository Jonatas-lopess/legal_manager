# 04: Payments + audit_log

**What to build:** `payments` (`matter_id` FK, fixed value, status `pago`/`pendente`). `audit_log` (`user_id`, `tenant_id`, action/entity/entity_id) capturing every write to `clients`/`matters`/`payments` — since no service/repository layer exists yet, this is a DB-level trigger, not app-layer logging. RLS enabled+forced on `payments` via `current_tenant_id()`; `audit_log` itself scoped so a tenant only sees its own entries.

**Blocked by:** 02 (clients + catalog + matters + tags)

**Status:** done

- [x] `payments` table: `matter_id` FK, fixed value column, status enum (`pago`/`pendente`)
- [x] `audit_log` table: `user_id`, `tenant_id`, action/entity/entity_id
- [x] Trigger(s) capture every write to `clients`, `matters`, `payments` into `audit_log` with the acting `user_id`
- [x] RLS enabled + forced on `payments` and `audit_log` via `current_tenant_id()`
- [x] Test: same-tenant vs cross-tenant read/write on `payments`
- [x] Test: a write to `clients`/`matters`/`payments` produces a matching `audit_log` row with correct `user_id`/`tenant_id`
- [x] Test: cross-tenant read of `audit_log` returns zero rows

## Comments

Implemented: migrations `20260905023858_payments-audit-log.sql` +
`..._rls.sql`. One shared `audit_log_row_change()` SECURITY DEFINER trigger
function (reads `auth.uid()`/`TG_OP`/`TG_TABLE_NAME`, `NEW`/`OLD` generically)
attached to `clients`/`matters`/`payments` via two triggers per table — one
for insert/delete (unconditional), one for update guarded by `WHEN (OLD IS
DISTINCT FROM NEW)` so a no-op `UPDATE ... SET x = x` doesn't add a row and
dilute the log (caught in review). No client-reachable insert/update/delete
grant exists on `audit_log` at all — the trigger is the only writer.
`user_id` FK to `users(id)` is `ON DELETE SET NULL` (the audit trail outlives
a removed user); `tenant_id` is likewise nullable + `ON DELETE SET NULL`
against `tenants(id)`, not the default `CASCADE` every other tenant-scoped FK
uses (caught in review: deleting a tenant would otherwise destroy its own
audit trail, the opposite of the log's purpose). `user_id`/`tenant_id` are
nullable since a non-authenticated write (our own test fixture/migration
setup, and any future service-role write) has no `auth.uid()`. No role-based
restriction on `payments` at this layer — PLANNING §8's
`secretario`-blocked-from-payments rule is `clients-catalog-matters-crud`'s
app-layer job, deliberately out of scope here. Tests in
`04-payments-audit-log.test.ts`, 8/8 passing.
