import * as React from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listMyNotifications, markNotificationRead, type Notification } from "../notifications.controller";

/**
 * A lightweight header dropdown (spec's Implementation Decisions: "a
 * lightweight list/dropdown... not a full notification center") — own
 * state, own fetch-on-mount, own error handling, mirroring
 * tags/components/TagPicker.tsx's self-contained style rather than lifting
 * state up into App.tsx. Wired into AppShell's header next to "Sair"
 * (App.tsx), visible whenever `user` is truthy — same condition that button
 * already uses.
 */
export function NotificationsDropdown() {
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setError(null);
    try {
      setNotifications(await listMyNotifications());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as notificações.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  async function handleMarkRead(id: string) {
    setBusyId(id);
    try {
      await markNotificationRead(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível marcar a notificação como lida.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Notificações"
        data-testid="notifications-toggle"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white"
            aria-label={`${unreadCount} não lidas`}
          >
            {unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div
          role="menu"
          aria-label="Lista de notificações"
          className="absolute right-0 z-10 mt-2 w-80 rounded-xl border bg-background p-2 text-foreground shadow-lg"
        >
          {loading ? (
            <p className="p-2 text-sm text-muted-foreground">Carregando...</p>
          ) : notifications.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">Nenhuma notificação.</p>
          ) : (
            <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto" aria-label="Notificações">
              {notifications.map((notification) => (
                <li
                  key={notification.id}
                  className={`flex flex-col gap-1 rounded-md p-2 text-sm ${notification.readAt ? "" : "bg-accent"}`}
                >
                  <span className="font-medium">{notification.payload.matterLabel}</span>
                  <span className="text-muted-foreground">
                    {notification.payload.description} — vence em {notification.payload.dueDate}
                  </span>
                  {!notification.readAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="self-end"
                      disabled={busyId === notification.id}
                      onClick={() => handleMarkRead(notification.id)}
                    >
                      Marcar como lida
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p role="alert" className="p-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
