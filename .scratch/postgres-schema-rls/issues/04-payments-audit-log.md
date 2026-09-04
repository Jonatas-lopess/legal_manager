# 04: Payments + audit_log

**What to build:** `payments` (`matter_id` FK, fixed value, status `pago`/`pendente`). `audit_log` (`user_id`, `tenant_id`, action/entity/entity_id) capturing every write to `clients`/`matters`/`payments` — since no service/repository layer exists yet, this is a DB-level trigger, not app-layer logging. RLS enabled+forced on `payments` via `current_tenant_id()`; `audit_log` itself scoped so a tenant only sees its own entries.

**Blocked by:** 02 (clients + catalog + matters + tags)

**Status:** ready-for-agent

- [ ] `payments` table: `matter_id` FK, fixed value column, status enum (`pago`/`pendente`)
- [ ] `audit_log` table: `user_id`, `tenant_id`, action/entity/entity_id
- [ ] Trigger(s) capture every write to `clients`, `matters`, `payments` into `audit_log` with the acting `user_id`
- [ ] RLS enabled + forced on `payments` and `audit_log` via `current_tenant_id()`
- [ ] Test: same-tenant vs cross-tenant read/write on `payments`
- [ ] Test: a write to `clients`/`matters`/`payments` produces a matching `audit_log` row with correct `user_id`/`tenant_id`
- [ ] Test: cross-tenant read of `audit_log` returns zero rows
