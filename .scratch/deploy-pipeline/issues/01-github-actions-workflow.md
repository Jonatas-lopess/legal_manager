# 01: GitHub Actions deploy workflow

**Status:** ready-for-agent

Implements the pipeline described in `spec.md`'s Implementation Decisions: `.github/workflows/deploy.yml`, triggered on push to `main`, running lint → test → build → Supabase migrations → Edge Functions deploy → Cloudflare Pages deploy → HTTP smoke test, any step failing the rest.

- [x] `.github/workflows/deploy.yml` created, matching spec's 8-step order exactly.
- [x] Node 24 / pnpm 11 pinned (`pnpm/action-setup@v4` + `actions/setup-node@v4`, `cache: pnpm`), matching local `node -v`/`pnpm -v`.
- [x] `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm test` → `pnpm build` as sequential steps (fail-fast is GitHub Actions' default — no `continue-on-error` set anywhere).
- [x] Migrations via Supabase CLI (`supabase link` + `supabase db push`), not `drizzle-kit push`, per PLANNING.md §6.
- [x] `supabase functions deploy` with no function name — publishes everything under `supabase/functions/*`. Note: this now deploys four functions (`tenants`, `deadlines-alerts`, `deadlines-holiday-sync`, `daily-summary`), not the three listed in spec.md's Implementation Decisions — `daily-summary` shipped after the spec was written; no workflow change needed since the deploy step is already function-name-agnostic.
- [x] Cloudflare Pages deploy via `cloudflare/wrangler-action@v3` (`pages deploy apps/web/dist --project-name=...`), reusing the step-4 build output rather than Cloudflare's native build.
- [x] Smoke test step: curls the deployed URL (`steps.pages.outputs.deployment-url`, an output of `wrangler-action`), fails the job on non-200.
- [x] All credentials read from `secrets.*` — none hardcoded. Matches spec's secret list (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `VITE_SUPABASE_URL_PROD`, `VITE_SUPABASE_ANON_KEY_PROD`), plus one addition: `vars.CLOUDFLARE_PAGES_PROJECT_NAME` (a repo **variable**, not secret — the Pages project name isn't sensitive) to fill spec's `<nome-do-projeto>` placeholder.
- [x] Manual prerequisites (Supabase prod project + Cloudflare Pages project, tokens, GitHub secrets/variables, `GROQ_API_KEY` in the Supabase function vault) now have a guided path: `scripts/setup-deploy-pipeline.sh` (see `02-manual-setup-wizard.md`). Still requires the operator to actually run it — no agent can do this with real credentials.
- [ ] Not done: running the wizard, and the first real push through the pipeline (spec's acceptance bar — 8 green steps, Pages URL live at 200, `supabase db push` clean, all four functions in `supabase functions list`).

## Comments

**2026-09-23**: `spec.md`'s stated blocker ("repo has no GitHub remote yet") is stale — `origin` (`git@github.com:Jonatas-lopess/legal_manager.git`) is already configured. Workflow file written and YAML-validated (`python3 -c "import yaml; yaml.safe_load(...)"`), not yet exercised against real infra. `docs/agents/issue-tracker.md`'s "PRs as a request surface: Off... no git remote configured" was also stale (same root cause) — fixed in this pass, along with the matching stale line in `README.md`.
