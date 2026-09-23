import { FunctionsHttpError } from "@supabase/supabase-js";
import * as repo from "./insights.repository";
import type { DailySummary } from "./insights.schema";

/**
 * Same unwrap as tenants.service.ts's `unwrapFunctionError`: `.message` on
 * `supabase.functions.invoke`'s rejection is a generic "non-2xx status code"
 * string, the real `{ error }` body only lives on `.context` (a `Response`).
 * The daily-summary function's own errors (missing tenant, upstream model
 * failure) are worth surfacing as-is rather than genericizing.
 */
async function unwrapFunctionError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string };
      if (body.error) return new Error(body.error);
    } catch {
      // Body wasn't JSON (or already consumed) — fall through.
    }
  }
  return error instanceof Error ? error : new Error("Não foi possível gerar o resumo do dia.");
}

export async function getDailySummary(): Promise<DailySummary> {
  const { data, error } = await repo.fetchDailySummary();
  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error("Resposta vazia do resumo do dia.");
  return data;
}
