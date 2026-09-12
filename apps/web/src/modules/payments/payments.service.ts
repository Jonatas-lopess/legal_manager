import { createPaymentInputSchema } from "./payments.schema";
import type { Payment, CreatePaymentInput, PaymentStatus } from "./payments.schema";
import * as repo from "./payments.repository";
import type { PaymentRow } from "./payments.repository";
import { getCurrentUser, type CurrentUser } from "../tenants/tenants.controller";

function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    matterId: row.matter_id,
    value: Number(row.value),
    status: row.status as PaymentStatus,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** PLANNING §8's role matrix gives `secretario` no `payments` access — the
 * one row in the matrix stricter than "authenticated in this tenant"
 * (clients-catalog-matters-crud/spec.md, Implementation Decisions). Checked
 * here, server-side, via `tenants.controller.ts`'s `getCurrentUser()`,
 * before every exported function below touches the repository — matches
 * how the invite Edge Function's `admin`-only check was enforced in
 * tenants-auth-invite. Single guard, not duplicated per-call. */
async function requireNonSecretario(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Não autenticado.");
  if (user.role === "secretario") throw new Error("Secretário não tem acesso a pagamentos.");
  return user;
}

/** Insert carries `tenant_id` explicitly — RLS's `with check` compares it
 * against `current_tenant_id()` but PostgREST never fills it in for us. */
export async function createPayment(input: CreatePaymentInput): Promise<Payment> {
  const user = await requireNonSecretario();
  const parsed = createPaymentInputSchema.parse(input);

  const { data, error } = await repo.insertPayment(user.tenantId, parsed);
  if (error || !data) throw error ?? new Error("Falha ao registrar pagamento.");
  return toPayment(data);
}

/** Matter-scoped; RLS further scopes it to the caller's own tenant — see
 * payments.repository. */
export async function listPaymentsForMatter(matterId: string): Promise<Payment[]> {
  await requireNonSecretario();

  const { data, error } = await repo.listPaymentsForMatter(matterId);
  if (error) throw error;
  return (data ?? []).map(toPayment);
}

/** Flips `pago` <-> `pendente` — not a general field-patch. PLANNING §4
 * ("sem split") leaves no other payment field editable in this spec, so
 * this reads the row's current status itself rather than taking a target
 * status as input. */
export async function togglePaymentStatus(id: string): Promise<Payment> {
  await requireNonSecretario();

  const { data: current, error: fetchError } = await repo.fetchPaymentById(id);
  if (fetchError) throw fetchError;
  if (!current) throw new Error("Pagamento não encontrado.");

  const nextStatus: PaymentStatus = current.status === "pago" ? "pendente" : "pago";
  const { data, error } = await repo.updatePaymentStatus(id, nextStatus);
  if (error || !data) throw error ?? new Error("Falha ao atualizar status do pagamento.");
  return toPayment(data);
}
