# TODO — Ticket Index

Quick index into `.scratch/`. Each file's own `Status:` line is the source of truth — this is a pointer, not the state itself. See `docs/agents/issue-tracker.md` for the tracker convention.

## postgres-schema-rls

- Status: `ready-for-agent`
- Spec: `.scratch/postgres-schema-rls/spec.md`
- Issues:
  - `01-tenant-user-foundation.md` — ready-for-agent — no blockers
  - `02-clients-catalog-matters-tags.md` — ready-for-agent — blocked by 01
  - `03-deadlines-deadline-tags.md` — ready-for-agent — blocked by 02
  - `04-payments-audit-log.md` — ready-for-agent — blocked by 02

## tenants-auth-invite

- Status: `ready-for-agent`
- Spec: `.scratch/tenants-auth-invite/spec.md`
- Issues:
  - `01-first-admin-provisioning-script.md` — ready-for-agent — blocked by postgres-schema-rls/01
  - `02-login-session-route-guard.md` — ready-for-agent — blocked by 01
  - `03-invite-edge-function-roster.md` — ready-for-agent — blocked by 01, 02
- Depends on: `postgres-schema-rls`

## clients-catalog-matters-crud

- Status: `ready-for-agent`
- Spec: `.scratch/clients-catalog-matters-crud/spec.md`
- Issues:
  - `01-clients-crud.md` — ready-for-agent — blocked by postgres-schema-rls/02, tenants-auth-invite/02
  - `02-catalog-crud.md` — ready-for-agent — blocked by postgres-schema-rls/02, tenants-auth-invite/02
  - `03-matters-crud-rascunho-lifecycle.md` — ready-for-agent — blocked by 01, 02
  - `04-tags-matter-tagging.md` — ready-for-agent — blocked by 03
  - `05-payments-matter-scoped-role-gated.md` — ready-for-agent — blocked by 03, tenants-auth-invite/02
- Depends on: `postgres-schema-rls`, `tenants-auth-invite`

## deadlines-engine-alerts

- Status: `ready-for-agent`
- Spec: `.scratch/deadlines-engine-alerts/spec.md`
- Depends on: `postgres-schema-rls`, `tenants-auth-invite`, `clients-catalog-matters-crud`
