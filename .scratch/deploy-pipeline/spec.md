Status: ready-for-agent

# Pipeline de deploy (PLANNING §7 step 7)

## Problem Statement

Todo o resto do escopo MVP está pronto e testado (`postgres-schema-rls`, `tenants-auth-invite`, `clients-catalog-matters-crud`, `deadlines-engine-alerts`, `dashboard-reports` — todos `done` em `TODO.md`), mas o produto só existe hoje em `localhost`: `apps/web` builda para `dist/` e não é publicado em lugar nenhum; as três Edge Functions (`tenants`, `deadlines-alerts`, `deadlines-holiday-sync`) só rodam contra o stack local (`supabase start`); as migrations em `supabase/migrations/` nunca foram aplicadas a um projeto Supabase real. Não existe hoje nenhum jeito de um usuário de verdade (além de quem roda o repo localmente) acessar o sistema. PLANNING.md §4 já decidiu o destino (Cloudflare Pages para o SPA, Supabase gerenciado para backend/migrations) mas §7 step 7 ("Pipeline de deploy") nunca foi puxado pra sprint.

Hoje o repositório também não tem remote git configurado (`CLAUDE.md`, `docs/agents/issue-tracker.md`) — pré-requisito para o pipeline decidido abaixo.

## Solution

Um workflow de GitHub Actions, único e linear, disparado em push pra `main`, que builda, testa, aplica migrations, publica as Edge Functions e publica o SPA — nessa ordem, com qualquer falha interrompendo o pipeline antes de tocar produção. Cada passo reusa um script `pnpm` que já existe e já roda localmente (`lint`, `test`, `build`); os passos novos são só os de deploy em si (Supabase CLI + Wrangler). Um smoke test HTTP fecha o pipeline, confirmando que a versão publicada responde antes de marcar o deploy como sucesso.

Criar o remote GitHub e provisionar credenciais (Supabase access token, Cloudflare API token, GitHub encrypted secrets) são passos manuais, de responsabilidade de quem opera o projeto — ver Further Notes.

## User Stories

1. Como mantenedor do projeto, quero que todo push em `main` dispare deploy automático, para não depender de rodar comandos de deploy manualmente a cada mudança.
2. Como mantenedor, quero que o pipeline rode lint + a suíte de testes completa (incluindo os testes de `packages/db` contra Postgres real) antes de qualquer deploy, para que código quebrado nunca chegue a produção.
3. Como mantenedor, quero que as migrations pendentes em `supabase/migrations/` sejam aplicadas ao projeto Supabase de produção antes do frontend novo ser publicado, para que o SPA nunca rode contra um schema mais velho do que o código espera.
4. Como mantenedor, quero que as três Edge Functions (`tenants`, `deadlines-alerts`, `deadlines-holiday-sync`) sejam publicadas automaticamente junto com o resto, para que elas nunca fiquem dessincronizadas do código em `supabase/functions/`.
5. Como mantenedor, quero que o SPA buildado (`apps/web/dist`) seja publicado no Cloudflare Pages a partir do mesmo pipeline que aplicou as migrations, para garantir a ordem (schema primeiro, frontend depois) em vez de depender do build nativo do Cloudflare Pages rodando em paralelo/fora de ordem.
6. Como mantenedor, quero um smoke test HTTP rodando contra a URL publicada logo após o deploy, para saber na hora se o deploy quebrou algo, sem precisar descobrir isso manualmente depois.
7. Como mantenedor, quero que qualquer passo que falhar (teste, build, migration, deploy de function, deploy do SPA, smoke test) pare o pipeline imediatamente, para nunca ficar com um deploy parcial (ex.: schema novo + frontend antigo, ou frontend novo + function antiga) no ar.
8. Como mantenedor, quero que todas as credenciais (token Supabase, token Cloudflare, senha do banco) fiquem em GitHub encrypted secrets, nunca commitadas no repo, para não vazar acesso de produção.
9. Como mantenedor, quero documentação clara de quais secrets o pipeline exige e como gerá-los, para conseguir reconstruir o setup se um dia precisar (nova conta, novo projeto Supabase/Cloudflare).
10. Como mantenedor, quero que o pipeline pin de versão de Node e pnpm iguais ao ambiente local (`node -v`/`pnpm -v` atuais), para eliminar "funciona na minha máquina, quebra no CI" por diferença de runtime.
11. Como um futuro segundo desenvolvedor no projeto, quero que o próprio pipeline seja a documentação viva do processo de deploy (não um doc separado que desatualiza), para conseguir confiar nele sem arqueologia.
12. Como mantenedor, quero que uma falha no meio do pipeline (ex.: migration aplicada, mas deploy de function falhou) deixe rastro claro de até onde chegou, para eu saber manualmente o que precisa de reparo — rollback automático de migration está fora de escopo (ver Out of Scope).

## Implementation Decisions

- **Trigger**: `.github/workflows/deploy.yml`, evento `push` em `main` apenas. Sem preview deploy por PR nem ambiente de staging nesta primeira versão (repo hoje é branch única, sem fluxo de PR estabelecido).
- **Runner/versões**: `ubuntu-latest` (tem Docker disponível nativamente, necessário pro `testcontainers` que `packages/db`'s testes já usam). Pin Node 24 e pnpm 11 (via `pnpm/action-setup` + `actions/setup-node` com cache pnpm), espelhando o ambiente local atual (`node -v` → v24.17.0, `pnpm -v` → 11.8.0).
- **Ordem dos jobs/steps** (um workflow, sequencial — falha em qualquer step cancela os seguintes):
  1. Checkout + `pnpm install --frozen-lockfile`.
  2. `pnpm lint` (root `eslint .`).
  3. `pnpm test` (`pnpm -r test` — roda os 174 testes existentes hoje, incluindo os 70 de `packages/db` que já sobem Postgres real via `testcontainers` contra o mesmo conjunto de arquivos em `supabase/migrations/`; isso já é a validação de que as migrations aplicam limpas antes de qualquer coisa tocar produção).
  4. `pnpm build` (`pnpm -r build` — gera `apps/web/dist`).
  5. Deploy de migrations: Supabase CLI (`supabase link --project-ref $SUPABASE_PROJECT_REF` seguido de `supabase db push`), não `drizzle-kit push` — decisão já registrada em PLANNING.md §6 ("aplicado via Supabase CLI — packages/db/schema.ts continua fonte única"). Autentica via `SUPABASE_ACCESS_TOKEN` + senha do banco via `SUPABASE_DB_PASSWORD`.
  6. Deploy das três Edge Functions: `supabase functions deploy` (sem nome = publica as três em `supabase/functions/*`).
  7. Deploy do SPA: `wrangler pages deploy apps/web/dist --project-name=<nome-do-projeto>` (upload direto do build já feito no passo 4, não o build nativo do Cloudflare Pages — mantém a ordem migrations-antes-de-frontend controlada por este único pipeline em vez de dois sistemas de build rodando fora de sincronia). Autentica via `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`.
  8. Smoke test: `curl` (ou equivalente) contra a URL publicada do Cloudflare Pages, falha o job se não vier `200`.
- **Variáveis de build do SPA**: `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` de produção (client-safe, ver `.env.example`) injetadas como GitHub Actions secrets/variables no passo de build (passo 4), não hardcoded e não vindas do `.env` local (que é só pro stack local via `supabase start`).
- **Secrets GitHub necessários** (repo settings → Encrypted secrets): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `VITE_SUPABASE_URL_PROD`, `VITE_SUPABASE_ANON_KEY_PROD`.
- **Módulos tocados**: nenhum código de `apps/web`/`packages/*`/`supabase/functions/*` muda — só arquivos novos de infra: `.github/workflows/deploy.yml` e (se `wrangler pages deploy` exigir) um `wrangler.toml` mínimo em `apps/web/` declarando `pages_build_output_dir`/nome do projeto.
- **Pré-requisito fora do pipeline em si**: repo precisa de um remote GitHub (hoje não tem, ver `CLAUDE.md`). Criação do remote, dos tokens/API keys e do cadastro dos secrets no GitHub são passos manuais, de operador humano — não dá pra scriptar com segurança (credenciais). Ver Further Notes.

## Testing Decisions

- Correção de migration/schema já é coberta pela suíte existente de `packages/db` (Postgres real via `testcontainers`, mesmo arquivo-fonte `supabase/migrations/` que a etapa de deploy aplica) — não é um seam novo, só passa a rodar como gate obrigatório do pipeline antes do deploy tocar produção.
- Correção de build/lint já é coberta pelos scripts `pnpm build`/`pnpm lint` existentes — mesmo raciocínio, viram gate.
- O workflow do GitHub Actions em si (`.github/workflows/deploy.yml`) é o único seam novo desta spec. Não é testável por suíte automatizada de unidade (orquestra CLIs externos — Supabase CLI, Wrangler — contra ambientes reais); prior art do repo pra esse tipo de script operacional é `packages/db/scripts/provision-first-admin.ts` (`tenants-auth-invite` ticket 01): sem teste automatizado dedicado, verificado rodando de ponta a ponta contra um ambiente real e documentado (`packages/db/README.md`). O smoke test HTTP do passo 8 cumpre esse papel de verificação de ponta a ponta a cada execução real do pipeline, em vez de um teste unitário do workflow.
- Verificação de aceite desta spec: primeiro push que dispara o workflow precisa completar os 8 passos verde, resultar em URL do Cloudflare Pages respondendo 200, schema do Supabase de produção batendo com `supabase/migrations/` (`supabase db push` sem pendências), e as três functions listadas em `supabase functions list` do projeto real.

## Out of Scope

- Ambiente de staging/preview separado de produção; preview deploy por PR (Cloudflare Pages suporta nativamente, mas não entra nesta primeira versão — branch única hoje).
- Rollback automático de migration em caso de falha em step posterior (deploy de function ou do SPA falhar depois da migration já ter aplicado). Fica registrado no log do Actions run; reparo é manual.
- Criação do remote GitHub, geração de tokens (Supabase/Cloudflare) e cadastro de secrets — passos manuais de operador, fora do que pode ser codificado nesta spec.
- Domínio customizado / DNS para o Cloudflare Pages (usa o subdomínio `*.pages.dev` padrão até decisão em contrário).
- Monitoramento/alerta pós-deploy além do smoke test HTTP síncrono (ex.: uptime monitoring contínuo, alerta de erro em runtime) — não decidido, não é MVP.
- Modelo de cobrança / webhook de pagamento continuam fora de escopo (já decidido em PLANNING §8, não muda aqui).

## Further Notes

- Os passos manuais listados em Out of Scope (criar remote GitHub, gerar tokens Cloudflare/Supabase, cadastrar secrets) são exatamente o tipo de trabalho que a skill `wizard` deste projeto cobre — vale gerar um wizard interativo à parte pra guiar esses passos quando a implementação desta spec começar, em vez de descrevê-los em prosa aqui.
- `SUPABASE_PROJECT_REF`/nome do projeto Cloudflare Pages assumem que os projetos de produção (Supabase + Cloudflare Pages) já foram criados nos respectivos dashboards antes do primeiro run do pipeline — criação desses projetos também é manual, mesmo grupo de pré-requisitos acima.
- `supabase/config.toml` hoje tem `project_id = "legal_manager"`, que é só o identificador do stack local (`supabase start`) — não confundir com o `SUPABASE_PROJECT_REF` de produção usado no `supabase link` do pipeline, que é o ref do projeto real no dashboard Supabase.
