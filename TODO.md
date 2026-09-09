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

- Status: `ready-for-agent`
- Spec: `.scratch/clients-catalog-matters-crud/spec.md`
- Issues:
  - `01-clients-crud.md` — done
  - `02-catalog-crud.md` — done
  - `03-matters-crud-rascunho-lifecycle.md` — done
  - `04-tags-matter-tagging.md` — ready-for-agent — blocked by 03
  - `05-payments-matter-scoped-role-gated.md` — ready-for-agent — blocked by 03, tenants-auth-invite/02
- Depends on: `postgres-schema-rls`, `tenants-auth-invite`

## deadlines-engine-alerts

- Status: `ready-for-agent`
- Spec: `.scratch/deadlines-engine-alerts/spec.md`
- Issues:
  - `01-deadlines-schema-holidays-notifications.md` — ready-for-agent — blocked by postgres-schema-rls/01, postgres-schema-rls/03
  - `02-counting-engine-core.md` — ready-for-agent — blocked by 01
  - `03-deadlines-crud-listing-tags.md` — ready-for-agent — blocked by 02
  - `04-civil-holiday-sync.md` — ready-for-agent — blocked by 01
  - `05-deadline-alerts.md` — ready-for-agent — blocked by 03
- Depends on: `postgres-schema-rls`, `tenants-auth-invite`, `clients-catalog-matters-crud`
