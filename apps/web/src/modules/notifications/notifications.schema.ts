// Unlike every other built module, `notifications` has no client-facing
// create/update input at all — RLS grants `authenticated` no INSERT
// whatsoever (only the deadlines-alerts Edge Function's service-role key
// writes rows), and the only client-writable action, marking one's own
// notification read, is a fixed id -> `read_at = now()` update with no
// user-supplied payload to validate (the column-restricted UPDATE grant
// already prevents touching anything else). So there's no
// `@legal-manager/schema` shape to re-export here (unlike
// deadlines.schema.ts/tags.schema.ts/matters.schema.ts) — this file only
// carries the module's own domain types.

/** Mirrors supabase/functions/deadlines-alerts/repository.ts's
 * `NotificationPayload` (matter label, deadline description, due date) —
 * not imported across the apps/web <-> supabase/functions boundary (same
 * "each runtime area owns its own copy of this small shape" precedent that
 * ticket's own repository.ts documents for not importing
 * deadlines.repository.ts), just the same JSON shape by convention since
 * both sides read/write the same `notifications.payload` jsonb column. */
export interface NotificationPayload {
  matterLabel: string;
  description: string;
  dueDate: string;
}

export type NotificationChannel = "email" | "in_app";
export type NotificationStatus = "pending" | "sent" | "failed";

export interface Notification {
  id: string;
  channel: NotificationChannel;
  category: string;
  deadlineId: string | null;
  threshold: string | null;
  payload: NotificationPayload;
  status: NotificationStatus;
  readAt: string | null;
  createdAt: string;
  sentAt: string | null;
}
