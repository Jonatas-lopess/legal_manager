# Legal Office Manager

Domain glossary for the legal-office-management SaaS. See `PLANNING.md` for stack/architecture; this file is vocabulary only.

## Language

**Papel (role)**:
One of three fixed values in the MVP — `admin`, `advogado`, `secretario`. `admin` has full CRUD plus user management and financial access. `advogado` has CRUD on clients/matters/deadlines/payments, no user management. `secretario` has CRUD on clients/matters/deadlines, no `payments`, no user management. No isolation between two `advogado`s in the same tenant in the MVP — any user in a tenant can see any matter in that tenant. See ADR-0001 for tenant-level isolation scope.
_Avoid_: permission, access level.

**Status do cliente**:
`ativo` or `inativo`. No further states in the MVP.

**Status do matter**:
`rascunho`, `em_andamento`, `concluido`, `arquivado`. `rascunho` is a matter created before `client_id` and the catalog item are chosen — both are nullable only in this status, required once promoted to `em_andamento`. See ADR-0004.
_Avoid_: draft (use the Portuguese term — it matches the rest of the enum).

**Comarca / UF**:
The court jurisdiction and state a matter is filed in. Lives on `matters`, not on `clients` — a client can have matters in different comarcas, and it's the matter's forum that determines which forensic-holiday calendar the deadline engine applies. See ADR-0002.

**Prazo fatal / não-fatal**:
`is_fatal` boolean on `deadlines`, read directly by the counting engine to drive alert priority. Not a tag — must stay reliable, independent of tenant-editable labels.

**Contagem (counting_mode)**:
`dias_uteis` or `dias_corridos` — column on `deadlines`, decides whether weekends/forensic holidays are skipped when computing the due date. See ADR-0003.

**Tag de prazo**:
Freeform label on a `deadline` (legal-act name, urgency, etc.), reusing the `tags`/`matter_tags` pattern. Cosmetic and used for reporting/filtering only — never read by the counting engine.
