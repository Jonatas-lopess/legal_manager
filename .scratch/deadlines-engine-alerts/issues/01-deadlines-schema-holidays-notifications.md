# 01: Deadlines schema extension + holiday/notification tables

**What to build:** `deadlines` (added by `postgres-schema-rls`/03 with only `matter_id`/`is_fatal`/`counting_mode`) gains `start_date` (date, not null), `description` (text, not null), `status` (enum `pendente`/`cumprido`, default `pendente`), `due_date` (date, not null). Two new global reference tables: `civil_holidays` (`date`, `uf` nullable — null means national, `name`; unique on `(date, uf)`) and `forensic_holidays` (`start_date`, `end_date`, `description`, `source_year`) — both no `tenant_id`, readable by any authenticated user, writable only by a service-role key (no client-facing INSERT/UPDATE/DELETE policy). One new tenant-scoped table: `notifications` (`tenant_id`, `recipient_user_id`, `channel` enum `email`/`in_app`, `category` text, `deadline_id` nullable FK, `threshold` nullable text, `payload` jsonb, `status` enum `pending`/`sent`/`failed`, `read_at` nullable, `created_at`, `sent_at`), unique on `(deadline_id, threshold, channel)` where `deadline_id` is not null, RLS `SELECT`/`UPDATE` scoped to `tenant_id = current_tenant_id() AND recipient_user_id = auth.uid()`, no client-facing INSERT.

**Blocked by:** `postgres-schema-rls`/01 (`current_tenant_id()`), `postgres-schema-rls`/03 (the `deadlines` table this amends)

**Status:** done

- [x] `deadlines` has `start_date`, `description`, `status` (default `pendente`), `due_date` columns
- [x] `civil_holidays` exists: `date`, `uf` (nullable), `name`; unique `(date, uf)`
- [x] `forensic_holidays` exists: `start_date`, `end_date`, `description`, `source_year`
- [x] `notifications` exists with the columns above; unique `(deadline_id, threshold, channel)` where `deadline_id` is not null
- [x] `civil_holidays`/`forensic_holidays`: readable by any authenticated user, no client-facing write policy
- [x] `notifications`: RLS `SELECT`/`UPDATE` scoped to `tenant_id = current_tenant_id() AND recipient_user_id = auth.uid()`; no client-facing `INSERT`
- [x] Test: same-tenant vs cross-tenant `notifications` read/write (mirrors the RLS test pattern from `postgres-schema-rls`)
- [x] Test: an authenticated user from any tenant can read `civil_holidays`/`forensic_holidays`; no client role can write to either
- [x] Test: inserting a duplicate `(deadline_id, threshold, channel)` into `notifications` is rejected by the unique constraint

## Comments

Implemented: `packages/db/src/schema.ts` (deadlines columns + civil_holidays/forensic_holidays/notifications tables), migrations `20260909154711_deadlines-schema-holidays-notifications.sql` + `20260909154725_deadlines-schema-holidays-notifications-rls.sql`, fixtures extended, tests in `packages/db/test/05-deadlines-schema-extension.test.ts` (17 tests). 69/69 db-package tests passing, `tsc --noEmit` clean, `supabase migration up` applied cleanly against the running local stack. `unique(...).nullsNotDistinct()` and `uniqueIndex(...).where(...)` both worked via Drizzle directly, no hand-written fallback needed.
