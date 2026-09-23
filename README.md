# Legal Manager

SaaS multi-tenant de gestão para escritórios de advocacia. MVP foca em Controle de Clientes, Controle de Matters (catálogo personalizado), Gestão de Prazos (motor de contagem — diferencial do produto) e relatórios operacionais de prazo.

Rebuilt from the sibling `office_manager` (ManagerDesk) project — a local-first, single-tenant Tauri + cr-sqlite desktop app. This project reuses ManagerDesk's UI kit, form patterns, and schema conventions, but swaps its sync/network layer for a classic client-server architecture (Postgres + Supabase).

See `PLANNING.md` for full scope, stack, data model, and build order — read it before writing code, and keep it in sync as decisions change.

## Status

Monorepo skeleton, scaffolded per `PLANNING.md` §6. Module folders under `apps/web/src/modules/*` hold stub `.controller.ts` / `.service.ts` / `.repository.ts` / `.schema.ts` files only — no domain logic, no Postgres schema, no auth yet.

## Stack

- **Frontend**: React 19 + Vite + TypeScript + Tailwind (SPA, no SSR)
- **Routing**: `wouter`
- **Backend**: no dedicated server — client talks directly to Postgres via `supabase-js` (PostgREST), tenant isolation via RLS
- **Database**: Supabase Postgres (Drizzle used for dev/migrations only)
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage
- **Hosting**: Cloudflare Pages (frontend); backend is fully managed Supabase
- **Jobs**: `pg_cron` + `pg_net` for deadline alerts

## Project layout

```
legal_manager/
├── apps/
│   └── web/                 # React SPA
│       └── src/
│           ├── modules/     # 1 folder per bounded context (clients, matters, deadlines, payments, catalog)
│           └── components/  # shared UI kit, no domain logic
├── packages/
│   ├── schema/               # Zod domain schemas, shared by web and db
│   └── db/                   # Drizzle schema + migrations
└── supabase/
    ├── functions/             # Edge Functions (Deno)
    └── migrations/            # generated via drizzle-kit, applied via Supabase CLI
```

## Getting started

```bash
pnpm install
cp .env.example .env   # fill in Supabase project credentials
pnpm dev
```

### Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Run the web app in dev mode |
| `pnpm build` | Build all workspace packages |
| `pnpm preview` | Preview the production build |
| `pnpm test` | Run tests across the workspace |
| `pnpm lint` | Lint the repo |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:push` | Push schema changes to the database |
| `pnpm db:studio` | Open Drizzle Studio |

## Agent skills

- **Issue tracker**: local markdown under `.scratch/<feature-slug>/`, no git remote. See `docs/agents/issue-tracker.md`. `TODO.md` is a quick index, not the source of truth.
- **Domain docs**: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
