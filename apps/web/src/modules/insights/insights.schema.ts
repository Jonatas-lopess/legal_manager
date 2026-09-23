// No `@legal-manager/schema` shape here — same reasoning as
// notifications.schema.ts: this module has no client-facing input at all
// (the daily-summary Edge Function takes no body, only the caller's JWT),
// so there's nothing to validate with zod. Just the response shape.

/** Mirrors supabase/functions/daily-summary/service.ts's `DailySummaryResult`
 * — not imported across the apps/web <-> supabase/functions boundary (same
 * "each runtime area owns its own copy of this small shape" precedent as
 * notifications.schema.ts's `NotificationPayload`). */
export interface DailySummary {
  summary: string;
  generatedAt: string;
  stats: {
    overdueCount: number;
    dueTodayCount: number;
    dueThisWeekCount: number;
    activeMattersCount: number;
  };
}
