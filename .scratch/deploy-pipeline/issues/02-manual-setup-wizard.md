# 02: Manual production-setup wizard

**Status:** ready-for-agent

`spec.md`'s Further Notes calls out that creating the GitHub remote (done), the Supabase/Cloudflare Pages projects, generating tokens, and registering GitHub secrets are all manual operator steps — "exactly the type of work the `wizard` skill covers." This ticket is that wizard: `scripts/setup-deploy-pipeline.sh`.

- [x] 9-stage interactive script (built via the `wizard` skill, `template.sh` base unmodified above the STAGES marker).
- [x] Stages: Supabase prod project ref → Supabase access token → DB password → API URL/anon key → `GROQ_API_KEY` (pushed live via `supabase secrets set --project-ref`, confirm-gated) → Cloudflare account ID + API token → Cloudflare Pages project (Direct Upload) → register all 7 GitHub secrets + 1 variable via `gh secret set`/`gh variable set` → first `supabase db push` against production (confirm-gated).
- [x] Every `set_secret`/`set_var` name checked 1:1 against `secrets.*`/`vars.*` in `.github/workflows/deploy.yml` (`grep -oE` both files, diffed — exact match, see `01`'s ticket for the workflow itself).
- [x] Prod values written to `.env.production.local`, not the shared `.env` (that file's `VITE_SUPABASE_URL`/etc. are the *local* `supabase start` stack's values — mixing prod in would be actively dangerous). `.env.*` is already gitignored (`.gitignore:18`).
- [x] `bash -n` clean. No `shellcheck` available in this environment to run.
- [x] Linked from `README.md`'s new "Deploy pipeline" section.
- [ ] Not done, and can't be done by an agent: actually running it (needs the operator's own Supabase/Cloudflare/GitHub/Groq access).

## Comments

**2026-09-23**: Chose to commit this rather than treat it as throwaway — spec.md user story 9 ("quero documentação clara de quais secrets... para conseguir reconstruir o setup se um dia precisar") asks for exactly this: a durable, repeatable path for a future re-provision (new account, new Supabase/Cloudflare project), not a one-off. The `/wizard` skill's own guidance backs this: commit when the user wants a repeatable setup path that should live in the repo.
