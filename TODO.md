# TODO — Ticket Index

Quick index into `.scratch/`. Each file's own `Status:` line is the source of truth — this is a pointer, not the state itself. See `docs/agents/issue-tracker.md` for the tracker convention.

## postgres-schema-rls

- Status: `done`
- Spec: `.scratch/postgres-schema-rls/spec.md`
- Issues:
  - `01-tenant-user-foundation.md` — done
  - `02-clients-catalog-matters-tags.md` — done
  - `03-deadlines-deadline-tags.md` — done
  - `04-payments-audit-log.md` — done

## tenants-auth-invite

- Status: `done`
- Spec: `.scratch/tenants-auth-invite/spec.md`
- Issues:
  - `01-first-admin-provisioning-script.md` — done
  - `02-login-session-route-guard.md` — done
  - `03-invite-edge-function-roster.md` — done
- Depends on: `postgres-schema-rls`

## clients-catalog-matters-crud

- Status: `done`
- Spec: `.scratch/clients-catalog-matters-crud/spec.md`
- Issues:
  - `01-clients-crud.md` — done
  - `02-catalog-crud.md` — done
  - `03-matters-crud-rascunho-lifecycle.md` — done
  - `04-tags-matter-tagging.md` — done
  - `05-payments-matter-scoped-role-gated.md` — done
- Depends on: `postgres-schema-rls`, `tenants-auth-invite`

## deadlines-engine-alerts

- Status: `done`
- Spec: `.scratch/deadlines-engine-alerts/spec.md`
- Issues:
  - `01-deadlines-schema-holidays-notifications.md` — done
  - `02-counting-engine-core.md` — done
  - `03-deadlines-crud-listing-tags.md` — done
  - `04-civil-holiday-sync.md` — done
  - `05-deadline-alerts.md` — done
- Known follow-up bug (not this feature's scope): tenant deletion fails when it has audited child rows (`audit_log` FK violation on cascade) — belongs to `postgres-schema-rls`/04. Left ~300+ orphaned test tenants on the local stack; needs its own cleanup + trigger fix.
- Code-review pass (2026-09-09) on the finished feature found one confirmed bug (fixed: `DeadlineDialog` was sending every field on every edit, not just changed ones — could silently shift `due_date` on an unrelated edit if holidays changed since creation; now diffs `dirtyFields`, regression test added). Findings left as documented, non-blocking follow-ups (efficiency/duplication, not correctness): the business-day/holiday engine is duplicated between `apps/web/src/modules/deadlines/deadlines.service.ts` and `supabase/functions/deadlines-alerts/service.ts` (no cross-app shared-package precedent existed to avoid it); `deadlines-alerts` resolves holidays per-candidate instead of batched per `uf`; `deadlines-holiday-sync` fetches its 56 jurisdiction×year combinations sequentially instead of concurrently; a `notifications` row stuck in `status: 'failed'` blocks a retry on a later day (the dedup unique constraint doesn't distinguish "already sent" from "already tried and failed").
- Depends on: `postgres-schema-rls`, `tenants-auth-invite`, `clients-catalog-matters-crud`
