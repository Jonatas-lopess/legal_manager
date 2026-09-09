// Public API of the `notifications` module (PLANNING §6) — the rest of the
// app (App.tsx's header dropdown) reaches notification list/read-state only
// through this file, never notifications.service.ts/
// notifications.repository.ts directly (enforced by eslint-plugin-
// boundaries, see eslint.config.ts).
export { listMyNotifications, markNotificationRead } from "./notifications.service";
export type {
  Notification,
  NotificationChannel,
  NotificationStatus,
  NotificationPayload,
} from "./notifications.schema";
