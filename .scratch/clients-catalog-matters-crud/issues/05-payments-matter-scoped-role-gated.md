# 05: Payments (matter-scoped, role-gated)

**What to build:** Payments panel in the matter detail view (ticket 03): `admin`/`advogado` record a payment against a matter (fixed value + `pago`/`pendente` status), list a matter's payments, and toggle status. No partial-payment ledger/balance math (PLANNING §4: "sem split") — a plain list with create + status-toggle. `payments.service.ts` checks the caller's role via `tenants.service.ts`'s `getCurrentUser()` and rejects every action (create/list/status-toggle) for `secretario`, enforced server-side, not just hidden in the UI — first module to enforce a role narrower than "authenticated in this tenant" per PLANNING §8. Every create/status-change writes an `audit_log` row.

**Blocked by:** 03 (Matters CRUD — payments panel lives in the matter detail view). External: `tenants-auth-invite` ticket 02 (`getCurrentUser()` role lookup).

**Status:** ready-for-agent

- [ ] `admin`/`advogado` can create a payment (fixed value + status) against a matter, scoped to the correct matter/tenant
- [ ] `admin`/`advogado` can list a matter's payments and toggle status `pago`/`pendente`
- [ ] `secretario` attempting create, list, or status-toggle is rejected in `payments.service.ts` (not just UI-hidden)
- [ ] Every create/status-change produces an `audit_log` row
- [ ] Test seam: `payments.service.ts` against real local Supabase stack (no mocked `supabase-js`)
