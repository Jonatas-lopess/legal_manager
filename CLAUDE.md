# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Monorepo skeleton scaffolded per `PLANNING.md` §6 (pnpm workspace: `apps/web`, `packages/schema`, `packages/db`, `supabase/`). Module folders under `apps/web/src/modules/*` hold stub `.controller.ts`/`.service.ts`/`.repository.ts`/`.schema.ts` files only — no domain logic, no Postgres schema, no auth yet. Run `pnpm install` before anything else.

Full scope, stack, data model, folder layout, and build order live in `PLANNING.md` — read it before writing code, and keep it in sync as decisions change. Summary: SaaS multi-tenant de gestão para escritórios de advocacia, rebuilt from the sibling `office_manager` (ManagerDesk) project — a local-first single-tenant Tauri+cr-sqlite desktop app. This project swaps ManagerDesk's sync/network layer for classic client-server (Postgres + API), but reuses its UI kit, form patterns, schema conventions, and domain logic where noted in `PLANNING.md` §3.

When porting code, check the sibling `office_manager` repo as source — `PLANNING.md` §3/§4 list exactly what to reuse vs. rewrite.
