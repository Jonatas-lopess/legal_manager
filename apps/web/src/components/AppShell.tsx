import * as React from "react";
import { Link, useLocation } from "wouter";
import { DropdownMenu } from "radix-ui";
import { useAuth } from "@/modules/tenants/components/AuthProvider";
import { logout } from "@/modules/tenants/tenants.controller";
import { NotificationsDropdown } from "@/modules/notifications/components/NotificationsDropdown";

// Canonical top bar for every authenticated route (ui-shell-clientes-casos-config
// ticket 01) — replaces both the old AppShell header (App.tsx) and
// DashboardNav.tsx (reports module), which drew two visibly different shells.
// Visual shape is DashboardNav's (logo, active-underline nav links, avatar
// chip on the right) per the wireframe-confirmed shape (metricas-dashboard/
// prazos-agenda), now the only shell in the app.
const navLinks = [
  { path: "/clients", label: "Clientes" },
  { path: "/matters", label: "Casos" },
  { path: "/dashboard/metricas", label: "Métricas" },
  { path: "/dashboard/prazos", label: "Prazos" },
];

const menuItemClass =
  "flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground";

function AvatarMenu() {
  const { user, refresh } = useAuth();
  const initial = user?.email ? user.email.charAt(0).toUpperCase() : "?";

  async function handleLogout() {
    await logout();
    await refresh();
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border-strong bg-secondary text-sm font-medium text-foreground"
          title={user?.email ?? undefined}
          aria-label={user?.email ? `Menu do usuário: ${user.email}` : "Menu do usuário"}
        >
          {initial}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-10 min-w-40 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          <DropdownMenu.Item asChild>
            <Link href="/settings" className={menuItemClass}>
              Configurações
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={handleLogout} className={menuItemClass}>
            Sair
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [location] = useLocation();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b bg-card p-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-semibold text-primary">
            Legal Manager
          </Link>
          {user && (
            <nav className="flex gap-4 text-sm">
              {navLinks.map(({ path, label }) => {
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
          )}
        </div>
        {user && (
          <div className="flex items-center gap-2">
            <NotificationsDropdown />
            <AvatarMenu />
          </div>
        )}
      </header>
      <main className="flex flex-1 items-start justify-center p-6">{children}</main>
    </div>
  );
}
