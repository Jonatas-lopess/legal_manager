import { supabase } from "@/lib/supabase";
import type { DailySummary } from "./insights.schema";

/**
 * GET, not POST — the Edge Function is a pure read+generate over data the
 * caller's own RLS-visible tenant already exposes elsewhere (deadlines,
 * matters), no client body to send. `supabase.functions.invoke` defaults to
 * POST, so the method has to be set explicitly (same convention as
 * tenants.repository.ts's `removeMember` setting `method: "DELETE"`).
 */
export async function fetchDailySummary() {
  return supabase.functions.invoke<DailySummary>("daily-summary", { method: "GET" });
}
