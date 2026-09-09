import * as repo from "./notifications.repository";
import type { NotificationRow } from "./notifications.repository";
import type { Notification } from "./notifications.schema";

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    channel: row.channel,
    category: row.category,
    deadlineId: row.deadline_id,
    threshold: row.threshold,
    payload: row.payload,
    status: row.status,
    readAt: row.read_at,
    createdAt: row.created_at,
    sentAt: row.sent_at,
  };
}

/** RLS scopes this to the caller's own tenant + recipient — see
 * notifications.repository. Ordered most-recent-first by the repository
 * query; no further filtering needed here. */
export async function listMyNotifications(): Promise<Notification[]> {
  const { data, error } = await repo.listMyInAppNotifications();
  if (error) throw error;
  return (data ?? []).map(toNotification);
}

/** One-directional, mirrors deadlines.service.ts's markDeadlineCumprido
 * shape — no "mark unread" in this ticket's scope (story 29 only asks for
 * marking read). */
export async function markNotificationRead(id: string): Promise<Notification> {
  const { data, error } = await repo.markRead(id);
  if (error || !data) throw error ?? new Error("Falha ao marcar notificação como lida.");
  return toNotification(data);
}
