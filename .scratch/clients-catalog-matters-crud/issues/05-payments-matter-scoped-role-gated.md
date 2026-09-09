# 05: Payments (matter-scoped, role-gated)

**What to build:** Payments panel in the matter detail view (ticket 03): `admin`/`advogado` record a payment against a matter (fixed value + `pago`/`pendente` status), list a matter's payments, and toggle status. No partial-payment ledger/balance math (PLANNING §4: "sem split") — a plain list with create + status-toggle. `payments.service.ts` checks the caller's role via `tenants.service.ts`'s `getCurrentUser()` and rejects every action (create/list/status-toggle) for `secretario`, enforced server-side, not just hidden in the UI — first module to enforce a role narrower than "authenticated in this tenant" per PLANNING §8. Every create/status-change writes an `audit_log` row.

**Blocked by:** 03 (Matters CRUD — payments panel lives in the matter detail view). External: `tenants-auth-invite` ticket 02 (`getCurrentUser()` role lookup).

**Status:** done

- [x] `admin`/`advogado` can create a payment (fixed value + status) against a matter, scoped to the correct matter/tenant
- [x] `admin`/`advogado` can list a matter's payments and toggle status `pago`/`pendente`
- [x] `secretario` attempting create, list, or status-toggle is rejected in `payments.service.ts` (not just UI-hidden)
- [x] Every create/status-change produces an `audit_log` row
- [x] Test seam: `payments.service.ts` against real local Supabase stack (no mocked `supabase-js`)

## Comments

Implemented as specced.

- **`payments` has no general field-patch, so the zod v4 `.partial()`-doesn't-strip-`.default()` bug (ticket 03) doesn't apply.** `createPaymentInputSchema` (packages/schema/src/index.ts) is the only payments schema; the status toggle (`togglePaymentStatus`) takes no status input at all — it fetches the row's current `status` and flips it — so there's no `.partial()` derivative to trip on the bug. Confirmed no schema needed for the toggle path.
- **Role gate is one guard, `requireNonSecretario()` in `payments.service.ts`**, called at the top of `createPayment`/`listPaymentsForMatter`/`togglePaymentStatus` before any repository call — throws `"Secretário não tem acesso a pagamentos."` for `role === "secretario"` and `"Não autenticado."` for no session, matching the pattern the spec pointed at (invite Edge Function's `admin`-only check). Reaches `getCurrentUser()` via `tenants.controller.ts`, never `tenants.service.ts` directly.
- **No audit_log calls from `payments.service.ts`** — confirmed (again, per tickets 01/03) that `payments_audit_log_insert_delete`/`_update` triggers (`supabase/migrations/20260905023909_payments-audit-log-rls.sql`) already fire; the last test case asserts directly against `audit_log`.
- **No delete story** — matches the ticket checklist; `payments.repository.ts` has no `deletePayment`.
- **`value` normalized with `Number(row.value)` in `payments.service.ts`'s `toPayment()`** rather than trusting PostgREST's numeric-to-JSON-number serialization blindly — defensive, since `payments` is the first numeric(12,2) column any repository in this repo has had to read back.
- **UI**: `apps/web/src/modules/payments/components/PaymentPanel.tsx` fills `MatterDetailView.tsx`'s `data-slot="matter-payments-panel"` Card — a list of the matter's payments (BRL-formatted value via `Intl.NumberFormat`, a status badge) plus a value-only create form (status implicitly `pendente`, per the spec's simplified model) and a per-row toggle button. The panel checks `getCurrentUser()` itself before fetching/rendering anything and renders a "Você não tem acesso a esta seção." note instead for `secretario`, so the UI never attempts a call the service layer would reject anyway. Only that Card's `CardContent` and the new import changed in `MatterDetailView.tsx` — ticket 04's tags Card and the rest of the file untouched. Plain inline form again, no new dialog primitive, matching every prior ticket's decision.
- Manually verified via the automated suite only, per the parent spec's Testing Decisions (no UI/component tests in this repo's prior art) — did not additionally drive this one through a browser.
