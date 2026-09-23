# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

MVP feature-complete per `TODO.md`: Postgres schema + RLS, multi-tenant auth, clients/catalog/matters CRUD, deadlines engine + alerts, dashboard reports, and the unified UI shell are all `done`. Only `deploy-pipeline` is still open (`ready-for-agent`, blocked on a GitHub remote). Run `pnpm install` before anything else.

Full scope, stack, data model, folder layout, and build order live in `PLANNING.md` — read it before writing code, and keep it in sync as decisions change. Summary: SaaS multi-tenant de gestão para escritórios de advocacia, rebuilt from the sibling `office_manager` (ManagerDesk) project — a local-first single-tenant Tauri+cr-sqlite desktop app. This project swaps ManagerDesk's sync/network layer for classic client-server (Postgres + API), but reuses its UI kit, form patterns, schema conventions, and domain logic where noted in `PLANNING.md` §3.

When porting code, check the sibling `office_manager` repo as source — `PLANNING.md` §3/§4 list exactly what to reuse vs. rewrite.

- When committing, always use the conventional commit format; include the optional commit body only on fixes; do not include co-authors.

## Agent skills

### Issue tracker

Local markdown under `.scratch/<feature-slug>/` (no git remote configured for this repo). See `docs/agents/issue-tracker.md`. Check `TODO.md` at the repo root first — it's a quick index into `.scratch/`, not the source of truth (each ticket's own `Status:` line is).

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
