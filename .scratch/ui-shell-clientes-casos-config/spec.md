Status: ready-for-agent

# Unified app shell + Clientes/Casos/Configurações UI (wireframe parity)

## Problem Statement

Two gaps, one root cause. First: `dashboard-reports` shipped `/dashboard/metricas`/`/dashboard/prazos` against real Figma wireframes (structural, hand-drawn — see that spec's "Wireframes (Figma)"), but every other screen (`ClientsTable`, `MattersTable`/`MatterDetailView`, `MembersTable`, the `/catalog`/`/payments`/`/audit` stub routes) predates any wireframe and uses `AppShell`'s own header/layout — a visibly different shell (left-aligned link list, static header, no avatar menu) from `DashboardNav`'s top bar (logo, active-underline links, avatar chip). Second: four new pages now have wireframes too — `clientes-lista`, `casos-lista`, `casos-detalhe`, `configuracoes` (same "Legal" Figma file as `metricas-dashboard`/`prazos-agenda`) — confirmed 2026-09-11 to use that same top-bar shell, not a dashboard-only variant, resolving `dashboard-reports/spec.md`'s "Further Notes" item that flagged this as unresolved app-wide nav-shape debt. This feature unifies the shell and builds/relayouts the four screens against their wireframes, 1:1 to the extent a structural wireframe supports (see `dashboard-reports/spec.md`'s own caveat: positioning/spacing are approximate, not pixel-matched — same rule applies here).

## Wireframes (Figma)

Same file as `dashboard-reports`: "Legal", https://www.figma.com/design/FlfSZ1yXCF63y6KijLYuvQ/Legal

- **Clientes** — frame `clientes-lista`, node `18:7`
- **Casos (lista)** — frame `casos-lista`, node `18:120`
- **Casos (detalhe)** — frame `casos-detalhe`, node `18:223`
- **Configurações** — frame `configuracoes`, node `18:374`

Pulled via `get_metadata` 2026-09-11 (structure/text only, no `get_design_context` pass yet — do that per-frame during implementation, not from this brief alone, per this file's own "Further Notes"). That pull surfaced real gaps against the original brief below — see "Fidelity check against the drawn frames" — issues `03`/`04`/`05` are written against the corrected findings, not the original brief.

No separate frames for the avatar dropdown or any create/edit dialog — per the user (2026-09-11), both are inferred: the dropdown from the avatar chip already drawn in `metricas-dashboard`/`prazos-agenda`, and every dialog from this codebase's existing dialog convention (`InviteUserDialog.tsx`'s direct `radix-ui` `Dialog` import — no shared `components/ui/dialog.tsx` wrapper exists yet, same for a dropdown-menu primitive) rather than a shadcn-style wrapper.

The full text brief used to generate these four frames is preserved at the bottom of this file's **Further Notes** for traceability (what was asked for vs. what got drawn — diff them before treating a frame as final).

### Design tokens

No new tokens. Reuses `apps/web/src/index.css`'s slate scale + Inter/Geist Mono split exactly as `dashboard-reports` extracted it — see that spec's "Design tokens" table. The avatar dropdown surface uses the existing `--popover`/`--popover-foreground` pair (already in the `@theme inline` block, unused until now).

### Fidelity check against the drawn frames (2026-09-11)

The text brief (bottom of this file) was the input to drawing these frames, not a spec of what actually got drawn. Diffing the two surfaced real gaps — data the wireframe assumes exists but the schema doesn't have yet, and one area (`configuracoes`) that came back structurally different from what was asked for. Each is called out again in its ticket; collected here for one read:

1. **`matters` has no case-number field.** `casos-detalhe`'s "Dados do processo" card draws a **NÚMERO CNJ** field (`1002345-67.2024.5.02.0000`) alongside UF/Comarca/Município — `Matter` has no such column today. New nullable `numero_cnj text` column, additive migration, surfaced in `03`.
2. **`payments` has no description field**, and the wireframe's Financeiro table implies per-payment labels ("Parcela 1/3 - Honorários Iniciais", "Taxas e Custas Extrajudiciais Reembolsáveis") plus a "Nova descrição de pagamento..." input on create. **This brushes against a standing decision**: `PaymentPanel.tsx`'s own comment cites PLANNING §4's "sem split" (no installment-splitting) model. Resolution used in `03`: add one nullable `description text` column and a matching create-form field — free text the user can type "Parcela 1/3 - ..." into if they want, same as the wireframe shows — but build no real installment machinery (no parcela-number/total columns, no auto-split, no linked-payment-group concept). That's additive, not a reversal of "sem split"; flag if that reading is wrong before `03` starts.
3. **Equipe gets a delete action** ("Excluir" per row) that doesn't exist anywhere in `tenants.*` today (`tenants.controller.ts` exports `listMembers`/`inviteUser`, no remove). New capability, not just UI — surfaced in `04`, including the RBAC questions removal raises (self-removal, last-admin protection) that a plain UI pass wouldn't otherwise need to answer.
4. **Equipe's role pills are gendered per example person** (ADVOGADA vs ADVOGADO, SECRETÁRIA vs SECRETÁRIO) — flavor text from invented example names, not a real requirement: `users` has no gender field and `userRoleEnum` has exactly `admin`/`advogado`/`secretario`. Keep the existing combined-form labels (`"Advogado(a)"`/`"Secretário(a)"`), don't add a gender field.
5. **`configuracoes` only fully drew one tab.** The frame renders the tab strip (Equipe | Catálogo | Tags | Auditoria) plus a complete Equipe table — but Catálogo/Tags/Auditoria are represented by a single compact strip below it, explicitly labeled **"OUTRAS CONFIGURAÇÕES (PREVISÃO MVP)"** ("other settings, MVP preview"), not three more full tab mockups:
   - Catálogo: `· Petições Iniciais — Criado em 12/08/2024` style bullet lines (name + creation date), not a filterable table.
   - Tags: `· Urgente (Crítico) · Tributário · Administrativo` — an inline chip/dot-separated line, same visual family as `casos-detalhe`'s "TAGS DO CASO" chip row, not a per-row table with a color-swatch column.
   - Auditoria: one example narrative line, `· 22/10 14:02h | Dr. Marcos | Criou Caso #1002` — a composed sentence (date/time | actor | verb + entity + id), not the Data/Hora/Usuário/Ação/Entidade/ID column table the original brief asked for.

   `04`/`05` are corrected to build each tab in this simpler, compact shape rather than the heavier filterable-table UI the original brief (bottom of this file) described. A real entidade/ação/date filter on Auditoria is still worth adding for usability once there's real log volume — keep it, but as an explicit addition beyond what's drawn, not a fidelity item.
6. **`casos-detalhe` has a page title** (`"Silva & Associados — Recurso Trabalhista"`, client name + a short case label) that `MatterDetailView.tsx` doesn't render today. `matters` has no title field — compose it the same way `casos-lista`'s "Item de catálogo / Processo" column does (see `03`), not a new field.
7. **The Prazos card's per-row secondary badge is a tag chip or a fatal marker, not a counting-mode chip** — corrected the original brief's guess. Row 1 (vencido) shows a plain tag chip (`INTERNO`), row 2 (hoje, `is_fatal`) shows `● FATAL`, row 3 (próximos) shows a plain tag chip (`COMUM`) — i.e. the slot shows `● FATAL` when `is_fatal`, otherwise the deadline's own tag if it has one. `dias_uteis`/`dias_corridos` isn't shown anywhere on this card.
8. **The Prazos card's due-date text varies by bucket** and one variant implies time-of-day (`"Hoje (17:00h)"`) that `deadlines.dueDate` doesn't carry (date only, same "no time component" shape as everywhere else in this app). Render `"Hoje"` without a fabricated time rather than inventing one — same "don't invent data the schema can't back" rule `dashboard-reports` applied to its own payment-date gap.
9. **The vencido/hoje/próximos grouping this card needs already exists, just in the wrong module.** `reports.service.ts` (function around what the code calls `getPrazosCriticos`) filters deadlines through `dueDateHighlight` (keeps `vencido`/`vence_em_breve`, drops `on_track`) and then re-buckets by comparing `dueDate` to today's local date into vencido/hoje/próximos — this is exactly the grouping `casos-detalhe`'s new card needs, just currently private to `reports`. `dashboard-reports`' own code-review pass already flagged `reports.service.ts` duplicating date-arithmetic that belongs in `deadlines.service.ts` as a follow-up debt — `03` is where that finally gets paid down: extract this bucketing into `deadlines.service.ts` (re-exported via `deadlines.controller.ts`, same precedent `dueDateHighlight` itself already set), parameterize it by an optional `matterId`, and have both `reports.service.ts` and the new card call the shared version instead of `casos-detalhe` importing from `reports` (which would invert this feature's intended read-only aggregate-over-domain-modules dependency direction) or reimplementing it a third time.

## Solution

Mostly relayout, not new backend — but not zero new backend either, per the fidelity check above. `clients`/`matters`/`tags`/`payments`/`deadlines` are all fully implemented (`clients-catalog-matters-crud`, `deadlines-engine-alerts`) and this is largely relayout of existing components (`ClientsTable`, `ClientDialog`, `MattersTable`, `MatterDetailView`) plus one new piece of UI (a matter-scoped Prazos card, reusing `deadlines.controller.ts` with a `matterId` filter — `ListDeadlinesFilter.matterId` already exists, no new query there). Three small additive gaps ride along in `03`/`04`, all called out above: `matters.numero_cnj` (new nullable column), `payments.description` (new nullable column), and a new member-removal capability in `tenants.*` (no column needed, just a missing function).

`catalog` and `tags` are also fully implemented end-to-end (service/repository/controller all real, confirmed 2026-09-11) — only their management UI is missing (nothing under `catalog/components/`, and `tags` today only has the inline `TagPicker`/`DeadlineTagPicker` pickers, no standalone list/CRUD screen). Per the fidelity check, both render as compact lists/chips in `04`, not filterable data tables.

`audit` is the one genuine new vertical slice: `apps/web/src/modules/audit/*` is a full stub (`export {}` in all four files) but the Postgres side already exists and needs no migration — `audit_log` table, `audit_log_select_own_tenant` RLS policy (any `authenticated` tenant member, no role restriction — see "RBAC" below), and the insert-only triggers on `clients`/`matters`/`payments` all shipped in `postgres-schema-rls`'s `04-payments-audit-log.md`. This feature fills in `audit.schema.ts`/`audit.repository.ts`/`audit.service.ts`/`audit.controller.ts` (read-only: one `listAuditLog` query, tenant-scoped by RLS, joined against `users` for the actor's `name`/`email` the same way `tenants.service.ts`'s `listMembers` already does) plus its tab UI — rendered as compact narrative log lines per the fidelity check, not a column table.

### Information architecture change (App.tsx)

- **Shell**: one component replaces both `AppShell`'s current `<header>` and `DashboardNav` — same top-bar visual (logo left, nav links, right-side icon cluster) on every authenticated route, not just `/dashboard/*`.
- **Nav links**: `Clientes | Casos | Métricas | Prazos` — no "Painel" link. Per the user (2026-09-11): Painel splits into its two existing children directly, same pair `metricas-dashboard`/`prazos-agenda` already show in their own nav bar. `/dashboard/metricas` and `/dashboard/prazos` are unchanged as routes; only their nav chrome moves into the shared shell.
- **Right side**: notification bell (`NotificationsDropdown`, unchanged) + avatar — now a dropdown trigger (today it's a static `<div>` in `DashboardNav`, nothing at all in `AppShell`), opening: **Configurações**, **Sair** (replaces the standalone "Sair" `Button` both shells currently render next to the avatar).
- **`/` (root)**: today renders `MembersTable` (team roster as the de facto home screen). Once Equipe moves under Configurações, `/` has nothing to show — redirect it to `/dashboard/metricas`, the natural landing page for an authenticated member (decided here, not left open — same "decide it, don't invent a third option later" approach the rest of this repo's specs take).
- **Retired from top nav** (moduleRoutes' current 7-entry list is deleted): `Catálogo`, `Financeiro`, `Auditoria` (fold into Configurações — see below), `Painel` (splits into Métricas/Prazos), `Prazos` (the `/deadlines` CRUD listing — folds contextually into Casos, see below).
- **`/deadlines` (`DeadlinesTable`)**: route stays, just loses its top-nav entry. Still reachable via `PrazosPage.tsx`'s existing "Ver todos os prazos catalogados" link (`dashboard-reports` story 15) — that deep link needs no change.
- **`/payments` (top-level stub, currently `<div>Financeiro</div>`)**: retired outright, no replacement route. Payments are matter-scoped only (`PaymentPanel` inside `casos-detalhe`) — there's no cross-matter financeiro view drawn in any wireframe, don't invent one.
- **Routes unchanged**: `clients`/`matters` keep their existing paths (`/clients`, `/matters`, `/matters/:id`); only the nav *label*/layout changes, not the URLs — "Casos" is a nav label for `/matters`, not a new path, to avoid breaking any existing test that asserts on these paths.

### RBAC

Carried, not newly invented:
- `PaymentPanel` already hides itself for `secretario` (unchanged).
- `InviteUserDialog`'s trigger already renders admin-only (unchanged, just relocated into the Equipe tab).
- **Open decision**: Auditoria's RLS grants `SELECT` to any authenticated tenant member — no DB-level role gate (confirmed 2026-09-11, unlike `payments`, which the app layer additionally restricts for `secretario`). Decide during `05`'s implementation whether the Configurações "Auditoria" tab is visible to all roles (matches what RLS actually allows) or app-layer-restricted to `admin` only (matches the LGPD/sigilo-profissional accountability framing `postgres-schema-rls`'s audit ticket used to justify the feature at all). Leaning `admin`-only given that framing, but not decided here — pick one in `05` and document why.
- **New in this feature**: removing a member (Equipe's "Excluir") is admin-only, same gate as inviting — but also needs two guardrails a plain invite/list feature never had to consider: no removing yourself, and no removing the tenant's last remaining `admin` (would strand the tenant with no admin). Decide the exact UX for both (disable the action vs. let the call fail server-side with a clear message) in `04`, and decide there too whether "remove" deletes the `users` row only or also the underlying Supabase Auth user (the invite Edge Function precedent — `supabase/functions/tenants/service.ts` — is the place to check how the write-side already handles the Auth-vs-`users`-row split before adding a new write path next to it).

## Testing Decisions

- No new integration tests needed for Clientes/Casos relayout (pure UI, existing `clients`/`matters`/`tags`/`payments` test suites already cover the data layer) — verify by running the dev server against seeded data, same "boot + click-through, no browser/screenshot tool" caveat `dashboard-reports` flagged.
- Matter-scoped Prazos card: the vencido/hoje/próximos bucketing helper moves from `reports.service.ts` into `deadlines.service.ts` (see fidelity check point 9) — that move is the one real logic change in `03`, so it keeps its existing unit-test coverage (moves with it, not deleted) plus one new case for the added `matterId` param; the card itself needs no new test beyond confirming it only shows the current matter's deadlines.
- `matters.numero_cnj`/`payments.description`: plain nullable columns, covered by the existing `matters`/`payments` CRUD test suites once the schema/service/repository types include them — no new test category, just extend existing create/update assertions to cover the new field.
- New `tenants` member-removal function: integration-tested against a real disposable Postgres instance (same harness as every other module) — admin-only, tenant-scoped, and both new guardrails (no self-removal, no removing the last admin).
- `audit.repository.ts`'s `listAuditLog`: integration-tested against a real disposable Postgres instance (same harness as every other module), covering tenant isolation and that it surfaces rows the existing `clients`/`matters`/`payments` triggers already write (seed a write, assert the log row appears with the right `actor`/`action`/`entity`).

## Out of Scope

- Any new Figma frame for the avatar dropdown or a create/edit dialog — inferred per the user, not drawn.
- Pixel-exact spacing — structural wireframe, same caveat `dashboard-reports` documented.
- A cross-matter/global Financeiro view — not drawn anywhere, `/payments` stub route is retired, not replaced.
- Assigning real semantic colors to any status pill — stays monochrome slate + uppercase label, same rule `dashboard-reports`' `01` ticket already settled.
- Renaming `/clients`/`/matters` routes to Portuguese paths — nav label changes only.
- Real installment/parcela tracking on payments (parcela-number/total columns, auto-split, linked-payment groups) — `payments.description` is free text only, see fidelity check point 2. Don't build split logic PLANNING §4 deliberately left out.
- Filterable/paginated Catálogo or Tags tables in Configurações — both render as the compact list/chip shape the frame actually drew (fidelity check point 5), not the heavier table UI the original brief asked for.

## Further Notes

- Depends on: `dashboard-reports` (done — this feature reuses its shell precedent and both existing frames), `clients-catalog-matters-crud` (done), `deadlines-engine-alerts` (done), `postgres-schema-rls` (done — `audit_log` table/RLS/triggers already shipped).
- Node ids for all four frames are filled in above (pulled via `get_metadata` 2026-09-11). `get_design_context` per-frame (screenshot + reference code) hasn't been pulled yet — do that during `02`/`03`/`04` implementation rather than working from this file's structural dump alone.
- Original text brief handed to the wireframe tool (2026-09-11), preserved verbatim for traceability against what actually got drawn:

```
FILE: "Legal" (mesmo arquivo Figma das wireframes existentes, node 4:5 metricas-dashboard / node 4:164 prazos-agenda)
NEW FRAMES: clientes-lista, casos-lista, casos-detalhe, configuracoes

GLOBAL STYLE TOKENS (reuse from metricas-dashboard/prazos-agenda — do not invent new hues)
- Palette: flat Tailwind slate scale only, monochrome, no red/amber/green anywhere
  background #f8fafc | card #ffffff | border #e2e8f0 | secondary/muted fill #f1f5f9
  border-strong/input/ring #94a3b8 | muted-foreground #64748b | data-accent #475569
  primary #1e293b | foreground #0f172a
- Status pills: slate fill + uppercase label text, NEVER color-coded
- Typography: Inter for all UI text — Geist Mono for every numeric/date value
- Card pattern: white card, #e2e8f0 border, rounded, header row with eyebrow label + title

APP SHELL (canonical top bar for the whole app, same one metricas-dashboard/prazos-agenda draw)
- Top bar, no sidebar: "Legal Manager" logo mark left
- Nav links: Clientes | Casos | Métricas | Prazos
- Right side: notification bell, avatar circle as a DROPDOWN TRIGGER -> menu: "Configurações", "Sair"

=== FRAME: clientes-lista ===
CRUD list of law-firm clients (PF/PJ). Header: title + search + status filter + "Novo cliente". Table:
Nome | CPF/CNPJ | Telefone | E-mail | Status (pill) | ações. Create/edit dialog: nome, cpf, cnpj, rg,
data de nascimento, telefone, e-mail, endereço, estado civil, profissão, parte contrária, procuração,
observações. States: empty, loading skeleton, archived row muted.

=== FRAME: casos-lista ===
CRUD list of matters. Header: title + search + status filter + client filter + "Novo caso". Table:
Cliente | Item de catálogo | UF/Comarca/Município | Status (pill) | ações. Row click -> casos-detalhe.

=== FRAME: casos-detalhe ===
Back button + Editar. Stacked full-width cards:
1. Dados do processo — status, UF, comarca, município, descrição
2. Prazos (NEW) — grouped vencido/hoje/próximos, descrição + due date (mono) + status pill + FATAL badge +
   counting-mode chip, "Marcar cumprido" per row, inline "+ Novo prazo"
3. Tags — existing TagPicker
4. Financeiro — existing PaymentPanel, hidden for secretario

=== SCREEN (avatar dropdown, not top nav): configuracoes ===
Tabs: Equipe (members table + admin-only "Convidar usuário"), Catálogo (simple nome list + create),
Tags (nome + color swatch list + create), Auditoria (read-only: Data/Hora, Usuário, Ação, Entidade, ID —
filters by entidade/ação/date, admin-only)
```
