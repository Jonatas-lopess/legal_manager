# Legal Office Manager — Planejamento de Arquitetura (MVP)

> Documento de bootstrap para nova sessão. Base de comparação: `office_manager` (ManagerDesk), app desktop offline-first Tauri v2 + React 19 + cr-sqlite/CRDT para escritórios de contabilidade.

## 1. Escopo

**Produto**: SaaS de gestão para escritórios de advocacia.

**MVP (escopo reduzido, foco em diferencial)**: Controle de Clientes + Controle de Matters (catálogo personalizado) + Gestão de Prazos (motor de contagem — diferencial do produto) + Relatórios focados em prazo (o que vence essa semana / vencido).

**Diferencial escolhido**: motor de prazos processuais bem feito (dias úteis, feriado forense, alerta confiável) + relatório operacional em cima disso. Dor real, concorrente costuma ser fraco ou genérico nisso. Resto do escopo original vira versão simples ou é adiado — ver abaixo.

**Reduzido a versão simples no MVP** (não cortado, só sem complexidade extra):
- Financeiro: valor fixo + status pago/pendente. Sem timesheet por hora, sem honorário de êxito, sem split — commodity, todo concorrente tem, não é onde construir diferencial primeiro.

**Fora do MVP** (deixar hooks arquiteturais, não construir agora):
- Acompanhamento de processos (integração Jusbrasil, PJe, Projudi ou similar) — API não-oficial/scraping frágil, alto custo de engenharia
- Integração WhatsApp (mensagens automáticas)
- Agente de IA para referência jurídica (RAG sobre jurisprudência/doutrina) — continua fora, escopo grande e distinto do item abaixo
- Portal do cliente — feature de venda, não de retenção nesse estágio
- Documentos avançado (upload, e-signature, versionamento, template de petição) — editor de petição é projeto à parte

**Trazido pro escopo (decisão 2026-09-22)**: resumo diário por LLM — dado do dia (prazos vencendo, matters em andamento) resumido em linguagem natural no dashboard. Menor escopo que o "agente de IA" acima (sem RAG, sem chat, uma chamada de leitura sobre dado já existente) — ver §5.

## 2. O que reaproveitar do ManagerDesk

| Item | Local no ManagerDesk | Como reaproveitar |
|---|---|---|
| UI kit completo (Radix + Tailwind + CVA) | `src/components/ui/*` (~40 componentes) | Copiar quase 1:1 — é agnóstico de domínio |
| Shell de página/relatório | `src/components/panel/panel-kit.tsx` (`AppShell`, `StatCard`, `TableCard`, `StatusBadge`, `currency`) | Base pronta para telas de lista e dashboard — **decisão 2026-09-10**: as telas `/dashboard/metricas` e `/dashboard/prazos` (`dashboard-reports`) não reaproveitam o shell de sidebar do ManagerDesk; usam nav de topo própria (`DashboardNav`), conforme wireframe. Demais telas seguem com a sidebar do `AppShell` atual. |
| Padrão de schema + validação | `src/db/schema.ts` → `drizzle-zod` em `validations.ts` | Mesmo padrão Drizzle, trocar `sqlite-core` por `pg-core` |
| Padrão de formulário | `service-dialog.tsx`, `financial-dialog.tsx` (react-hook-form + zodResolver) | Reaproveitar arquitetura de dialog/form, trocar campos |
| Máscaras BR | `src/lib/masks.ts` (CPF, CNPJ, telefone, moeda) + pacote `cpf-cnpj-validator` | Direto — domínio brasileiro é o mesmo |
| Tags | `tagsTable` + `matter_tags` (join table) | Reaproveitar para categorizar matters |
| Auditoria | `logsTable` + `src/lib/logger.ts` | Ainda mais crítico em escritório jurídico (sigilo, compliance) — evoluir para audit log com `user_id` |
| Import em massa | `src/components/panel/csv-import-dialog.tsx` | Migração de carteira de clientes existente |
| Padrão de relatório | `src/pages/dashboard.tsx` (StatCard + `recharts` AreaChart + TableCard) | Base direta para os "Relatórios intuitivos" do MVP |
| Reatividade de UI | `useLocalQuery` + `DBChangeHub` (qualquer write invalida toda query ativa) | Ideia reaproveitável, mecanismo não — ver §5 |

## 3. O que NÃO reaproveitar (troca de raiz)

| Item atual | Por quê não serve | Substituto |
|---|---|---|
| Shell Tauri + updater via share de rede (`src/lib/updater.ts`) | SaaS é web, sem instalador `.msi` | Web app puro (ou Tauri só se decidirem por app desktop *adicional* depois) |
| cr-sqlite CRDT + sync P2P hub-and-spoke (`useSyncBridge.ts`, `change-hub.ts`, `src-tauri/src/lib.rs` Axum WS) | Resolve conflito entre réplicas locais sem servidor; SaaS já tem fonte única de verdade | Client-server clássico (API + Postgres) |
| SQLite local por máquina | Sem isolamento multi-tenant, sem acesso remoto | Postgres central gerenciado |
| `managed-fs` / `client-folder.ts` (abre pasta no SO local) | Não existe "pasta local" em SaaS multi-dispositivo | Object storage (S3/R2) com URLs assinadas |
| Ausência de auth (app é single-user) | SaaS precisa login + isolamento por escritório | Auth multi-tenant do zero (§6) |

## 4. Arquitetura macro proposta

### Stack

- **Frontend**: React 19 + Vite + TS + Tailwind — mesma base, reuso quase total de `components/ui`. Manter SPA (não Next.js): é produto B2B atrás de login, não precisa SSR/SEO; SPA minimiza a migração de código vindo do ManagerDesk.
- **Roteamento**: `wouter` (manter, já é a escolha atual).
- **Backend**: sem servidor Node/Worker dedicado para CRUD — app fala direto com Postgres via `supabase-js` (PostgREST), isolamento multi-tenant garantido por RLS (`tenant_id`). Único componente server-side é uma Supabase Edge Function (Deno), usada só onde um segredo não pode ir ao client: webhook de pagamento (se/quando decidir cobrar assinatura SaaS do tenant — ainda em aberto, ver §8) e envio de e-mail de alerta de prazo.
- **Banco**: Supabase Postgres. Schema quase idêntico ao `schema.ts` atual — troca de dialeto (`sqlite-core`→`pg-core`). Drizzle usado só em dev/migração (`db:generate`/`db:push`); runtime não depende de conexão TCP direta (evita o erro de pooling/Hyperdrive já observado no `projeto_ebd` ao tentar Worker→Postgres direto).
- **Auth multi-tenant**: Supabase Auth. Organização/tenant modelada como tabela própria (`tenants` + `users.tenant_id`), não via "Organizations" nativo (Supabase Auth não tem isso pronto como Clerk) — trade-off aceito em troca de unificar tudo (DB+Auth+Storage+Functions) num fornecedor só.
- **Storage de arquivos**: Supabase Storage, prefixado por `tenant_id`, RLS também no bucket — substitui a pasta local de cliente.
- **Hosting**: Cloudflare Pages só para o SPA estático (frontend). Backend inteiro é Supabase gerenciado — nenhum host de servidor a escolher/pagar.
- **Jobs**: `pg_cron` + `pg_net` dentro do próprio Supabase agenda e dispara os alertas de prazo — chama a Edge Function quando a lógica passa de SQL puro (ex.: motor de contagem de dias úteis/feriado forense, envio de e-mail).
- **Feriado forense — escopo**: motor de prazo cobre feriado nacional + estadual (não municipal/comarca no MVP). Fonte de dado — decidida, ver §8.

### Multi-tenancy

Banco compartilhado, coluna `tenant_id` em toda tabela + Postgres RLS. Sem backend dedicado (client fala direto com PostgREST), então a policy não pode depender de `SET LOCAL`/`current_setting` — resolve `tenant_id` via função `SECURITY DEFINER` que consulta `public.users` por `auth.uid()` (ver ADR-0005). Mais simples de operar que schema-per-tenant; volume de escritórios jurídicos não justifica a complexidade de isolamento físico.

### Modelo de dados macro (MVP)

- `tenants` — escritório
- `users` — `tenant_id`, `role` (`admin` / `advogado` / `secretario` — capacidades base decididas, matriz completa ainda a decidir, ver §8)
- `clients` — evolução de `clientsTable`: mantém CPF/CNPJ, soma campos jurídicos (RG, endereço, estado civil, profissão, parte contrária, dados de procuração). `status`: `ativo` / `inativo`.
- `matter_catalog_items` — **novo**: hoje é `serviceTypesArray` (enum hardcoded no schema); no SaaS vira tabela CRUD por tenant, já que um dos requisitos do MVP é "catálogo personalizado"
- `matters` — evolução de `servicesTable`: `client_id`, FK pro catálogo em vez de enum fixo, `uf` (obrigatório) + `comarca`/`municipio` (opcional) — motor de prazo lê a localização do matter, nunca do client, já que um client pode ter matters em comarcas diferentes (ver ADR-0002). `status`: `rascunho` / `em_andamento` / `concluido` / `arquivado` — em `rascunho`, `client_id` e o item de catálogo são nullable; passam a obrigatórios ao promover para `em_andamento` (ver ADR-0004).
- `deadlines` — **novo**: hoje `final_date`/`restitution_date` são campos soltos em `matters`; domínio jurídico precisa de N prazos por processo, cada um com tipo e alerta — essa é a peça central de "Gestão de Prazos". Colunas `is_fatal` (bool) e `counting_mode` (`dias_uteis`/`dias_corridos`) lidas direto pelo motor de contagem — sem catálogo de tipos, sem depender de tag editável pelo tenant (ver ADR-0003). Rotulagem livre (nome do ato, urgência) via `tags`/`matter_tags` estendido para `deadlines`, cosmético, nunca lido pelo motor. Alertas MVP: limiar fixo (5 dias úteis e 1 dia útil antes do vencimento), canais e-mail + in-app; sem configuração por tenant no MVP.
- `payments` — reaproveita `paymentsTable` quase igual, versão simples: valor fixo + status pago/pendente (sem timesheet por hora no MVP)
- `tags` / `matter_tags` — reaproveita igual, estendido também para `deadlines` (ver acima)
- `audit_log` — evolução de `logsTable`, soma `user_id`

Retenção (ver §8, LGPD): `clients`/`matters` somam `deleted_at` (soft-delete) + `retention_until` (calculado a partir do prazo prescricional aplicável) — exclusão física bloqueada a nível de schema antes de `retention_until`. Fluxo de atendimento a titular (acesso/correção/exclusão) continua manual no MVP; self-service adiado.

`documents` (metadata + referência de storage) sai do MVP — ver §6.

### Relatórios (MVP)

Reaproveitar o padrão `StatCard`/`TableCard`/`recharts` de `dashboard.tsx`. Relatórios mínimos: clientes ativos por status, matters por status, faturamento por período, prazos próximos/vencidos, volume por item de catálogo.

## 5. Hooks para o pós-MVP (não implementar agora, só não fechar a porta)

- **Jusbrasil**: campo `external_id`/`integration_source` em `matters`/`deadlines` desde já; tabela `integrations` (config de API key por tenant), vazia no MVP.
- **WhatsApp**: modelar `notifications`/`message_log` como canal genérico (hoje: e-mail/in-app; depois: WhatsApp) em vez de acoplar direto a um provedor.
- **Agente de IA**: nenhum hook técnico necessário agora — só manter os dados de cliente/serviço/histórico bem estruturados facilita RAG depois.
- **Documentos**: entidade `documents` (metadata + referência de storage, prefixada por `tenant_id`) fica fora do schema inicial; adicionar quando houver demanda real de anexo.
- **Portal do cliente**: nenhum hook técnico necessário agora — auth multi-tenant do §5 já suporta role adicional (`client`) depois sem redesenho.
- **Financeiro avançado**: se demandar timesheet por hora ou honorário de êxito depois, evoluir `payments` sem quebrar o schema simples (campo de tipo de cobrança extensível).
- **Custom roles por tenant**: MVP fixa 3 papéis (`admin`/`advogado`/`secretario` — ver §8) sem isolamento entre `advogado`s do mesmo tenant (ADR-0001). Destino desenhado em `docs/adr/0006-abac-personal-permissions-replace-role-enum.md` (permission pessoal via ABAC, sem tabela de roles) — não construir agora, ADR é design-only.
- **Desktop offline-first (P2P/CRDT)**: cogitado como possível diferencial (concorrente é tudo web puro), mas contradiz escopo reduzido — exige hub de sync central pra multi-tenant+auth (deixa de ser P2P puro), permissão por role fica difícil de garantir com merge CRDT client-trusted, soma superfície de Tauri multi-OS/updater/conflict resolution em cima do motor de prazo que é o foco real. Adiado; se retomado, avaliar como app desktop *adicional* sobre a API já pronta (§5), não como arquitetura de base.

## 6. Estrutura de pastas sugerida (repo novo)

```
legal-manager/
├── apps/
│   └── web/
│       └── src/
│           ├── modules/            # 1 pasta por bounded context — ver convenção abaixo
│           │   ├── clients/
│           │   ├── matters/
│           │   ├── deadlines/
│           │   ├── payments/
│           │   └── catalog/
│           └── components/ui/       # UI kit compartilhado (copiado do ManagerDesk), sem lógica de domínio
├── packages/
│   ├── schema/           # Zod schemas de domínio (tenants, clients, matters, deadlines...), usado por web e db
│   └── db/               # schema.ts (Drizzle/Postgres) + migrations, consome packages/schema
└── supabase/
    ├── functions/        # Edge Functions (Deno), mesma convenção de vertical slice, 1 pasta por contexto que precisa de segredo server-side
    └── migrations/        # decidido: gerado por drizzle-kit (`db:generate`), aplicado via Supabase CLI — packages/db/schema.ts continua fonte única
```

Nota: versão anterior deste documento listava `apps/api/` (Fastify/Hono). Removido — contradizia §5, que já define client falando direto com Supabase sem backend dedicado. §5 é a fonte de verdade.

### Convenção de vertical slice por bounded context

Sem `apps/api` dedicado (§5), a lógica que normalmente ficaria num backend precisa de um lugar organizado dentro de `apps/web` (e, quando precisar de segredo, em `supabase/functions`). Convenção: **1 pasta por bounded context**, dividida em camadas nomeadas por sufixo de arquivo — não por sub-pasta `controllers/`, `services/` etc. (evita import cruzado entre pastas de camada de contextos diferentes).

```
apps/web/src/modules/deadlines/
├── deadlines.controller.ts   # orquestra UI: page/hook que reage a evento, chama service, não sabe de Supabase
├── deadlines.service.ts      # regra de negócio (ex.: motor de contagem de dias úteis) — orquestra repository + schema
├── deadlines.repository.ts   # único arquivo do contexto que importa supabase-js / usa `.from("deadlines")`
├── deadlines.schema.ts       # reexport/composição de packages/schema + refinamento específico do contexto
└── components/               # dialogs, forms, tabelas ESPECÍFICOS do contexto (ex.: DeadlineDialog)
```

Mesma divisão dentro de `supabase/functions/<contexto>/` quando o contexto precisa de Edge Function (segredo, webhook, e-mail): `index.ts` (controller/entrypoint), `service.ts`, `repository.ts`.

**Regras**:
- Bounded contexts do MVP: `clients`, `matters`, `catalog` (matter_catalog_items), `deadlines`, `payments`, `tags`, `audit`. `tenants`/auth fica em contexto próprio (`auth` ou `tenants`), não espalhado.
- `repository.ts` é a única camada autorizada a importar `supabase-js` e referenciar nome de tabela — nenhum outro arquivo do contexto (ou de fora dele) faz `.from(...)` direto. Isso mantém a troca de fonte de dado (ex.: mock em teste) num lugar só.
- `service.ts` não importa `supabase-js` — só chama o `repository.ts` do próprio contexto. Regra de negócio (motor de prazo, cálculo de status) mora aqui, não no controller nem no repository.
- `controller.ts` não faz query nem regra de negócio — só traduz evento de UI (ou request de Edge Function) em chamada de `service.ts` e estado de UI/response.
- Contexto A não importa `repository.ts` de contexto B — se precisar de dado de outro domínio (ex.: `deadlines` precisa de `matter`), chama o `service.ts` público de B. Mantém o isolamento que RLS garante a nível de banco também a nível de código.
- `packages/db/schema.ts` continua único e compartilhado (é o schema físico da tabela) — a pasta `repository.ts` de cada contexto não duplica definição de tabela, só a consome.

## 7. Próximos passos

1. Bootstrap `apps/web` (Vite+TS+Tailwind) copiando `components/ui`, `lib/masks.ts`, `lib/utils.ts`, `cpf-cnpj-validator` do ManagerDesk.
2. Modelar `packages/db/schema.ts` em Postgres (tenants, users, clients, matter_catalog_items, matters, deadlines, payments, tags, audit_log) + RLS por `tenant_id`.
3. Auth multi-tenant (Supabase Auth) + scaffolding de organização/convite de usuário.
4. CRUD de Clientes + Catálogo de Matters + Matters (portar `service-dialog.tsx`, `financial-dialog.tsx`).
5. Prazos: entidade `deadlines` + motor de contagem (dias úteis/feriado forense) + tela de listagem + alertas básicos (e-mail/in-app) — prioridade máxima, é o diferencial.
6. Dashboard/Relatórios MVP focado em prazo (vence essa semana / vencido) — portar `dashboard.tsx`.
7. Pipeline de deploy (Cloudflare Pages/Vercel para o SPA + migrations Supabase).

## 8. Decisões de negócio em aberto

- **Modelo de cobrança**: **decidido — fora do MVP.** Lançar com cobrança manual/beta (fatura fora do app); sem webhook de pagamento nem gateway na v1. Revisitar plano/gateway/trial quando houver validação de mercado.
- **Go-to-market / onboarding**: **decidido — onboarding assistido.** Sem signup self-service na v1; tenant + primeiro `admin` provisionado manualmente (script ou operação direta). Revisitar se/quando o número de escritórios não couber mais em provisionamento manual.
- **Matriz de permissão RBAC**: papéis fixos do MVP (`admin`/`advogado`/`secretario`) seguem em produção — não bloqueia o passo 3 de §7 (auth + convite), que usa a matriz base já shippada. O desenho do destino pós-MVP está **decidido** em `docs/adr/0006-abac-personal-permissions-replace-role-enum.md`: substitui a role fixa por permission pessoal (ABAC) + `administrator_id` único por tenant, sem tabela de `roles`. Migração do enum/checks já shippados fica pra quando isso for puxado pra sprint real — o ADR é design-only.
- **Fonte de dado de feriado forense** (pesquisado): nenhuma API cobre feriado forense de verdade — BrasilAPI, Invertexto, FeriadosAPI, feriados.dev cobrem só feriado **civil** nacional/estadual/municipal, que não pega recesso decretado por tribunal, ponto facultativo do Judiciário, nem granularidade por comarca (ex.: TJSP tem portaria anual própria, por município). CNJ (Resolução 244/2016) normatiza o recesso nacional mas não expõe dado estruturado; AASP agrega link pra portaria de cada um dos 27 TJs, sem API, cobertura incompleta ("caráter meramente supletivo", vários tribunais "não divulgado em meios oficiais"). Scraping direto de 27 portais é frágil demais pra base do diferencial do produto.
  **Decisão**: híbrido — API civil paga (FeriadosAPI, melhor custo/cobertura: grátis nacional/estadual/capitais, Professional $49/mês ilimitado) cobre feriado nacional+estadual civil; tabela própria (`forensic_holidays` ou similar) curada manualmente por UF cobre recesso forense/portaria de tribunal, atualizada 1x/ano usando AASP como ponto de partida. Cliente final (escritório) pode também sobrescrever/complementar por comarca, já que feriado municipal só suspende prazo na comarca local.

### LGPD / sigilo profissional (OAB) — pontos de atenção

Dado tratado aqui é sensível por natureza: cliente do escritório, parte contrária (terceiro sem vínculo contratual direto), eventualmente dado de processo penal. Pontos a resolver antes de lançar, não só documentar:

- **Base legal por tipo de titular**: cliente do tenant (execução de contrato) vs. parte contrária (legítimo interesse — precisa de transparência, não dá pra pedir consentimento de quem não é titular da conta).
- **Papel do escritório vs. da plataforma**: escritório (tenant) é controlador dos dados de seus clientes; esta plataforma SaaS é operadora. Precisa de contrato/DPA formalizando isso — não é só engenharia.
- **Sigilo profissional (Estatuto da OAB, art. 7º/34 + Código de Ética)**: isolamento entre tenants via RLS (§5) cobre o caso óbvio; decidir se precisa também de isolamento *dentro* do tenant (advogado A não vê matter de advogado B do mesmo escritório) — depende da matriz de RBAC acima.
- **Retenção de dado**: **decidido** — schema soma `deleted_at` + `retention_until` em `clients`/`matters` (ver §4), exclusão física bloqueada antes do prazo prescricional aplicável. Não é só contrato, está no schema desde o MVP.
- **Dado sensível (LGPD art. 5º, II)**: **decidido — dentro do escopo do MVP.** Registro de matter penal/dado de saúde ligado ao caso é permitido sem gate técnico especial na v1 (bloquear cortaria mercado real); RLS + `audit_log` seguem como base de defesa. Nota de política/ToS, não restrição de schema.
- **Residência/hospedagem de dado**: região do projeto Supabase — sem exigência legal geral de residência no Brasil pra LGPD (diferente de setor público), mas boa prática avaliar região mais próxima/com melhor postura de compliance. **A decidir**, não bloqueia engenharia do MVP.
- **Direitos do titular**: **decidido — manual no MVP.** Acesso/correção/exclusão tratados manualmente pelo suporte (escritório é controlador, plataforma é operadora); UI self-service explicitamente adiada (opção C considerada e rejeitada por escopo, ver retenção acima). Formalizar processo documentado antes do lançamento público.
- **Resposta a incidente**: obrigação de notificar ANPD e titulares em caso de vazamento (art. 48) — **rascunho de processo desenhado**, ver `docs/lgpd-resposta-a-incidente.md` (fluxo de detecção/triagem/notificação/registro). Papéis (encarregado, jurídico externo) seguem **a decidir**; documento não bloqueia engenharia do MVP, mas precisa de validação jurídica antes do lançamento público.
- **Auditoria**: `audit_log` (§3/§5) já ajuda a demonstrar accountability — não é suficiente sozinho, mas é a base certa.
