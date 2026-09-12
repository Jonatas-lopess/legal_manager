-- matters_update_own_tenant (20260905023651_clients-catalog-matters-tags-rls.sql)
-- is backed by a column-level UPDATE grant, not a blanket one — a column
-- left off that list is silently un-updatable by `authenticated` even
-- though the RLS policy itself would allow the row (packages/db/README.md's
-- "RLS pattern for a new tenant-scoped table" + its two Gotcha notes).
-- numero_cnj (ui-shell-clientes-casos-config/03) needs to join that list;
-- Postgres column-level grants are additive, so this only needs to ADD the
-- new column, not restate/REVOKE the existing ones.
grant update (numero_cnj) on "public"."matters" to authenticated;
