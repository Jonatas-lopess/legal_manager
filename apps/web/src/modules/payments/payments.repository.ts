import type { z } from "zod";
import { supabase } from "@/lib/supabase";
import type { createPaymentInputSchema } from "./payments.schema";

// The already-`.parse()`d shape (service.ts's job, never this file's).
type ParsedCreatePayment = z.output<typeof createPaymentInputSchema>;

interface PaymentRow {
  id: string;
  matter_id: string;
  // PostgREST serializes `numeric` columns as a JSON number (no scale/
  // precision loss risk in the MVP's value range) but payments.service.ts's
  // `toPayment()` still runs every value through `Number(...)` defensively
  // rather than trusting that here.
  value: number | string;
  status: string;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = "id, matter_id, value, status, created_at, updated_at";

/** Insert carries `tenant_id` explicitly — RLS's `with check` compares it
 * against `current_tenant_id()` but PostgREST never fills it in for us.
 * `matter_id` is caller-supplied and shape-validated in packages/schema's
 * `createPaymentInputSchema`; the composite FK (packages/db/src/schema.ts)
 * rejects a matter belonging to another tenant, no need to duplicate that
 * check here. */
export async function insertPayment(tenantId: string, input: ParsedCreatePayment) {
  return supabase
    .from("payments")
    .insert({
      tenant_id: tenantId,
      matter_id: input.matterId,
      value: input.value,
      status: input.status,
    })
    .select(SELECT_COLUMNS)
    .single<PaymentRow>();
}

export async function fetchPaymentById(id: string) {
  return supabase.from("payments").select(SELECT_COLUMNS).eq("id", id).maybeSingle<PaymentRow>();
}

/** Matter-scoped list — RLS further scopes it to the caller's tenant. */
export async function listPaymentsForMatter(matterId: string) {
  return supabase
    .from("payments")
    .select(SELECT_COLUMNS)
    .eq("matter_id", matterId)
    .order("created_at", { ascending: false })
    .returns<PaymentRow[]>();
}

/** Sets `status` to whatever payments.service.ts's `togglePaymentStatus`
 * decided it should flip to — this file has no opinion on what a valid
 * transition is, it just writes the value it's given. */
export async function updatePaymentStatus(id: string, status: string) {
  return supabase
    .from("payments")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single<PaymentRow>();
}

export type { PaymentRow };
