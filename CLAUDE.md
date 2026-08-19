# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Repo has only `PLANNING.md` right now — no code, no package manifests, no git repo. No build/lint/test commands exist yet.

Full scope, stack, data model, folder layout, and build order live in `PLANNING.md` — read it before writing code, and keep it in sync as decisions change. Summary: SaaS multi-tenant de gestão para escritórios de advocacia, rebuilt from the sibling `office_manager` (ManagerDesk) project — a local-first single-tenant Tauri+cr-sqlite desktop app. This project swaps ManagerDesk's sync/network layer for classic client-server (Postgres + API), but reuses its UI kit, form patterns, schema conventions, and domain logic where noted in `PLANNING.md` §3.

When porting code, check the sibling `office_manager` repo as source — `PLANNING.md` §3/§4 list exactly what to reuse vs. rewrite.
