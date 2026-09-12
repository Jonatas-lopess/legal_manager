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
- See `03-deadlines-crud-listing-tags.md` Comments for the 2026-09-09 code-review pass; see `postgres-schema-rls`'s `04-payments-audit-log.md` Comments for the follow-up `audit_log` FK-on-cascade bug it found (fixed).
- Depends on: `postgres-schema-rls`, `tenants-auth-invite`, `clients-catalog-matters-crud`

## dashboard-reports

- Status: `done`
- Spec: `.scratch/dashboard-reports/spec.md`
- Issues:
  - `01-nav-shell-metricas-core-cards.md` — done
  - `02-metricas-charts-breakdowns.md` — done
  - `03-prazos-page.md` — done
  - `04-prazos-criticos-teaser.md` — done
- See `01-nav-shell-metricas-core-cards.md` Comments for the 2026-09-11 code-review pass (two confirmed `payments.created_at` UTC-vs-local-calendar-date bugs found and fixed).
- Depends on: `postgres-schema-rls`, `tenants-auth-invite`, `clients-catalog-matters-crud`, `deadlines-engine-alerts`

## ui-shell-clientes-casos-config

- Status: `done`
- Spec: `.scratch/ui-shell-clientes-casos-config/spec.md`
- Issues:
  - `01-unified-app-shell.md` — done
  - `02-clientes-page.md` — done
  - `03-casos-page-and-prazos-card.md` — done
  - `04-configuracoes-equipe-catalogo-tags.md` — done
  - `05-configuracoes-auditoria.md` — done
  - `06-shell-top-bar-fidelity.md` — done
  - `07-table-header-shading.md` — done
  - `08-casos-acoes-column.md` — done
  - `09-clientes-name-weight.md` — done
  - `10-caso-detalhe-header-and-payment-actions.md` — done
  - `11-prazos-page-table-rebuild.md` — done
- Wireframe node ids filled in (2026-09-11) — fidelity check against the real frames found real gaps (matters.numero_cnj, payments.description, team member removal, Configurações' Catálogo/Tags/Auditoria are compact not tabular); see spec.md's "Fidelity check against the drawn frames".
- See `01-unified-app-shell.md` Comments for the 2026-09-12 code-review pass over tickets 01-04 (9 of 10 findings fixed, including a last-admin-removal race closed with a transactional row lock — an earlier DB-trigger attempt was reverted, see Comments; the 10th finding — past commits' message format — flagged, not rewritten).
- **2026-09-12**: user reported the running app didn't match the wireframes; a real pixel-diff pass (screenshots vs. all 5 `18:*`/`4:164` frames, populated fixture data) found 8 gaps across the shell and every screen, including one outright regression (Casos lost its AÇÕES column/chevron when `01`'s code-review pass added an Archive button) and one page (Prazos) built as 3 cards instead of the wireframe's 1 table. See spec.md's "Fidelity check against the running build" for the full list; `06`-`11` fix it.
- **2026-09-12**: tickets `06`-`11` implemented and closed. No Figma MCP/browser-screenshot tool available in this environment — verified against `cap1.png` (a rendered reference of the Prazos page dropped in the repo root) plus `tsc --noEmit`/`vitest run` (18 files, 101 tests, all passing); see each ticket's Comments for specifics.
- Depends on: `postgres-schema-rls`, `tenants-auth-invite`, `clients-catalog-matters-crud`, `deadlines-engine-alerts`, `dashboard-reports`

## deploy-pipeline

- Status: `ready-for-agent`
- Spec: `.scratch/deploy-pipeline/spec.md`
- PLANNING.md §7 step 7. Repo has no GitHub remote yet — a prerequisite this spec's Further Notes calls out.
- Depends on: `postgres-schema-rls`, `tenants-auth-invite`, `clients-catalog-matters-crud`, `deadlines-engine-alerts`, `dashboard-reports`
