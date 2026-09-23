Status: ready-for-agent

# Local dev infra: cross-cutting bugs in the local Supabase stack

Not a feature — a home for infra-level bugs found while verifying features against the real local stack, that don't belong to any single feature's spec (they're pre-existing and cut across multiple Edge Functions).

## Problem Statement

Some local-stack bugs surface only when a feature is actually exercised end-to-end against real Docker containers (not just unit tests). When that happens for a bug that isn't specific to the feature under test, it's tracked here instead of polluting that feature's own (already `done`) ticket.

## Issues

- `01-edge-runtime-pg-dns-resolution.md` — Edge Functions can't reach local Postgres via `pg.Pool`
