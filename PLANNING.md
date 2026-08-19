# Legal Office Manager — Planejamento de Arquitetura (MVP)

> Documento de bootstrap para nova sessão. Base de comparação: `office_manager` (ManagerDesk), app desktop offline-first Tauri v2 + React 19 + cr-sqlite/CRDT para escritórios de contabilidade.

## 1. Escopo

**Produto**: SaaS de gestão para escritórios de advocacia.

**MVP**: Controle de Clientes + Controle de Serviços (catálogo personalizado + prazos) + Relatórios.

**Fora do MVP** (deixar hooks arquiteturais, não construir agora):
- Acompanhamento de processos (integração Jusbrasil ou similar)
- Integração WhatsApp (mensagens automáticas)
- Agente de IA para referência jurídica

## 2. Diferença estrutural crítica vs. ManagerDesk

ManagerDesk é **local-first, single-tenant, P2P**: cada máquina tem seu próprio SQLite e sincroniza via CRDT (cr-sqlite) por LAN, sem servidor central, sem conceito de usuário/login. O novo produto é **SaaS multi-tenant cloud**: dado mora num servidor central, múltiplos escritórios (tenants) isolados entre si, múltiplos usuários por escritório com login/permissão. Essa diferença invalida toda a camada de sync/rede do projeto atual — o resto (UI, forms, padrões de schema, domínio de negócio) é diretamente aproveitável.

## 3. O que reaproveitar do ManagerDesk

| Item | Local no ManagerDesk | Como reaproveitar |
|---|---|---|
| UI kit completo (Radix + Tailwind + CVA) | `src/components/ui/*` (~40 componentes) | Copiar quase 1:1 — é agnóstico de domínio |
| Shell de página/relatório | `src/components/panel/panel-kit.tsx` (`AppShell`, `StatCard`, `TableCard`, `StatusBadge`, `currency`) | Base pronta para telas de lista e dashboard |
| Padrão de schema + validação | `src/db/schema.ts` → `drizzle-zod` em `validations.ts` | Mesmo padrão Drizzle, trocar `sqlite-core` por `pg-core` |
| Padrão de formulário | `service-dialog.tsx`, `financial-dialog.tsx` (react-hook-form + zodResolver) | Reaproveitar arquitetura de dialog/form, trocar campos |
| Máscaras BR | `src/lib/masks.ts` (CPF, CNPJ, telefone, moeda) + pacote `cpf-cnpj-validator` | Direto — domínio brasileiro é o mesmo |
| Tags | `tagsTable` + `service_tags` (join table) | Reaproveitar para categorizar processos/serviços |
| Auditoria | `logsTable` + `src/lib/logger.ts` | Ainda mais crítico em escritório jurídico (sigilo, compliance) — evoluir para audit log com `user_id` |
| Import em massa | `src/components/panel/csv-import-dialog.tsx` | Migração de carteira de clientes existente |
| Padrão de relatório | `src/pages/dashboard.tsx` (StatCard + `recharts` AreaChart + TableCard) | Base direta para os "Relatórios intuitivos" do MVP |
| Reatividade de UI | `useLocalQuery` + `DBChangeHub` (qualquer write invalida toda query ativa) | Ideia reaproveitável, mecanismo não — ver §5 |

## 4. O que NÃO reaproveitar (troca de raiz)

| Item atual | Por quê não serve | Substituto |
|---|---|---|
| Shell Tauri + updater via share de rede (`src/lib/updater.ts`) | SaaS é web, sem instalador `.msi` | Web app puro (ou Tauri só se decidirem por app desktop *adicional* depois) |
| cr-sqlite CRDT + sync P2P hub-and-spoke (`useSyncBridge.ts`, `change-hub.ts`, `src-tauri/src/lib.rs` Axum WS) | Resolve conflito entre réplicas locais sem servidor; SaaS já tem fonte única de verdade | Client-server clássico (API + Postgres) |
| SQLite local por máquina | Sem isolamento multi-tenant, sem acesso remoto | Postgres central gerenciado |
| `managed-fs` / `client-folder.ts` (abre pasta no SO local) | Não existe "pasta local" em SaaS multi-dispositivo | Object storage (S3/R2) com URLs assinadas |
| Ausência de auth (app é single-user) | SaaS precisa login + isolamento por escritório | Auth multi-tenant do zero (§6) |

## 5. Arquitetura macro proposta

### Stack

- **Frontend**: React 19 + Vite + TS + Tailwind — mesma base, reuso quase total de `components/ui`. Manter SPA (não Next.js): é produto B2B atrás de login, não precisa SSR/SEO; SPA minimiza a migração de código vindo do ManagerDesk.
- **Roteamento**: `wouter` (manter, já é a escolha atual).
- **Backend**: API Node.js (Fastify ou Hono) + tRPC ou REST, Drizzle ORM.
- **Banco**: Postgres gerenciado (Neon/Supabase/RDS). Schema quase idêntico ao `schema.ts` atual — troca de dialeto (`sqlite-core`→`pg-core`, `integer(timestamp_ms)`→`timestamp`).
- **Auth multi-tenant**: Clerk ou Auth.js/Lucia com Organizations = escritórios; usuários = advogados/staff com role (owner/advogado/assistente).
- **Storage de arquivos**: Cloudflare R2 ou S3, prefixado por `tenant_id`, URLs assinadas — substitui a pasta local de cliente.
- **Hosting**: Vercel/Fly.io/Railway (app) + Postgres gerenciado separado.
- **Jobs**: scheduler simples (cron do host, ou Trigger.dev) para alertas de prazo — já útil no MVP mesmo sem WhatsApp/integração.

### Multi-tenancy

Banco compartilhado, coluna `tenant_id` em toda tabela + Postgres RLS (`policy` filtrando por `current_setting('app.tenant_id')`). Mais simples de operar que schema-per-tenant; volume de escritórios jurídicos não justifica a complexidade de isolamento físico.

### Modelo de dados macro (MVP)

- `tenants` — escritório
- `users` — `tenant_id`, `role`
- `clients` — evolução de `clientsTable`: mantém CPF/CNPJ, soma campos jurídicos (RG, endereço, estado civil, profissão, parte contrária, dados de procuração)
- `service_catalog_items` — **novo**: hoje é `serviceTypesArray` (enum hardcoded no schema); no SaaS vira tabela CRUD por tenant, já que um dos requisitos do MVP é "catálogo personalizado"
- `services` — evolução de `servicesTable`: `status`, `client_id`, FK pro catálogo em vez de enum fixo
- `deadlines` — **novo**: hoje `final_date`/`restitution_date` são campos soltos em `services`; domínio jurídico precisa de N prazos por processo, cada um com tipo e alerta — essa é a peça central de "Gestão de Prazos"
- `payments` — reaproveita `paymentsTable` quase igual
- `tags` / `service_tags` — reaproveita igual
- `documents` — **novo**: metadata + referência de storage (substitui a pasta local do SO)
- `audit_log` — evolução de `logsTable`, soma `user_id`

### Relatórios (MVP)

Reaproveitar o padrão `StatCard`/`TableCard`/`recharts` de `dashboard.tsx`. Relatórios mínimos: clientes ativos por status, serviços por status, faturamento por período, prazos próximos/vencidos, volume por item de catálogo.

## 6. Hooks para o pós-MVP (não implementar agora, só não fechar a porta)

- **Jusbrasil**: campo `external_id`/`integration_source` em `services`/`deadlines` desde já; tabela `integrations` (config de API key por tenant), vazia no MVP.
- **WhatsApp**: modelar `notifications`/`message_log` como canal genérico (hoje: e-mail/in-app; depois: WhatsApp) em vez de acoplar direto a um provedor.
- **Agente de IA**: nenhum hook técnico necessário agora — só manter os dados de cliente/serviço/histórico bem estruturados facilita RAG depois.

## 7. Estrutura de pastas sugerida (repo novo)

```
legal-manager/
├── apps/
│   ├── web/            # SPA Vite (copiar components/ui, lib/masks, lib/utils do ManagerDesk)
│   └── api/             # Fastify/Hono + Drizzle
├── packages/
│   └── db/               # schema.ts + validations.ts (Postgres), migrations
```

## 8. Próximos passos

1. Bootstrap `apps/web` (Vite+TS+Tailwind) copiando `components/ui`, `lib/masks.ts`, `lib/utils.ts`, `cpf-cnpj-validator` do ManagerDesk.
2. Modelar `packages/db/schema.ts` em Postgres (tenants, users, clients, service_catalog_items, services, deadlines, payments, tags, documents, audit_log) + RLS por `tenant_id`.
3. Auth multi-tenant (Clerk/Auth.js) + scaffolding de organização/convite de usuário.
4. CRUD de Clientes + Catálogo de Serviços + Serviços/Processos (portar `service-dialog.tsx`, `financial-dialog.tsx`).
5. Prazos: entidade `deadlines` + tela de listagem + alertas básicos (e-mail/in-app).
6. Dashboard/Relatórios MVP (portar `dashboard.tsx`).
7. Pipeline de deploy (Vercel/Fly.io + Postgres gerenciado).
