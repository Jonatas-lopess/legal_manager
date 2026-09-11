import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { logout } from "../../tenants/tenants.controller";
import { useAuth } from "../../tenants/components/AuthProvider";

// Shared top-bar nav for both dashboard routes (spec's "Nav shape" decision,
// confirmed 2026-09-10): logo mark, "Métricas"/"Prazos" links with the
// active one underlined, a simple user chip — no left sidebar, unlike the
// rest of the app's AppShell. App.tsx renders this in place of AppShell's
// own header whenever the current route is under `/dashboard`. Ticket 01's
// first pass left "Sair" out of this bar entirely, which stranded anyone on
// a dashboard route with no way to log out; keeps AppShell's own logout
// action (not NotificationsDropdown — that stays part of the rest of the
// app's chrome, not the wireframe's dashboard nav shape) next to the chip.
const dashboardLinks = [
  { path: "/dashboard/metricas", label: "Métricas" },
  { path: "/dashboard/prazos", label: "Prazos" },
];

export function DashboardNav() {
  const [location] = useLocation();
  const { user, refresh } = useAuth();
  const initial = user?.email ? user.email.charAt(0).toUpperCase() : "?";

  return (
    <header className="flex items-center justify-between border-b bg-card p-4">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-semibold text-primary">
          Legal Manager
        </Link>
        <nav className="flex gap-4 text-sm">
          {dashboardLinks.map(({ path, label }) => {
            const active = location.startsWith(path);
            return (
              <Link
                key={path}
                href={path}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "font-medium text-foreground underline underline-offset-4"
                    : "text-muted-foreground hover:text-foreground"
                }
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border-strong bg-secondary text-sm font-medium text-foreground"
          title={user?.email ?? undefined}
          aria-label={user?.email ? `Usuário: ${user.email}` : "Usuário"}
        >
          {initial}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await logout();
            await refresh();
          }}
        >
          Sair
        </Button>
      </div>
    </header>
  );
}
