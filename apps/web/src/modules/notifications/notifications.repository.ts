import { supabase } from "@/lib/supabase";
import type { NotificationChannel, NotificationPayload, NotificationStatus } from "./notifications.schema";

interface NotificationRow {
  id: string;
  channel: NotificationChannel;
  category: string;
  deadline_id: string | null;
  threshold: string | null;
  payload: NotificationPayload;
  status: NotificationStatus;
  read_at: string | null;
  created_at: string;
  sent_at: string | null;
}

const SELECT_COLUMNS = "id, channel, category, deadline_id, threshold, payload, status, read_at, created_at, sent_at";

// A "lightweight list/dropdown... not a full notification center" (spec) —
// a fixed page size rather than pagination UI.
const LIST_LIMIT = 50;

/** RLS already scopes `notifications` to `tenant_id = current_tenant_id()
 * AND recipient_user_id = auth.uid()` (ticket 01's migration), so no
 * explicit tenant/recipient filter is needed here — only what this file
 * adds on top: the `in_app` channel (this is the in-app notification list;
 * `email`-channel rows exist in the same table for the exact same alert but
 * are never read back by the browser) and recency ordering. */
export async function listMyInAppNotifications() {
  return supabase
    .from("notifications")
    .select(SELECT_COLUMNS)
    .eq("channel", "in_app")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT)
    .returns<NotificationRow[]>();
}

/** The column-restricted grant from ticket 01's migration (`grant update
 * (read_at) on notifications to authenticated`) already prevents this from
 * touching anything else — `status`/`payload`/`sent_at`/`category` stay
 * exactly as the alerts Edge Function wrote them regardless of what this
 * function is asked to update. */
export async function markRead(id: string) {
  return supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single<NotificationRow>();
}

export type { NotificationRow };
