import * as React from "react";
import { Link, useLocation } from "wouter";
import { DropdownMenu } from "radix-ui";
import { useAuth } from "@/modules/tenants/components/AuthProvider";
import { logout } from "@/modules/tenants/tenants.controller";
import type { UserRole } from "@/modules/tenants/tenants.controller";
import { NotificationsDropdown } from "@/modules/notifications/components/NotificationsDropdown";

// Same combined-form role labels MembersTable.tsx/InviteUserDialog.tsx
// already duplicate per-component rather than sharing — no real OAB/
// registration-number field exists yet (ticket 06), so this renders the
// identifying line the schema actually backs: name + role.
const roleLabels: Record<UserRole, string> = {
  admin: "Admin",
  advogado: "Advogado(a)",
  secretario: "Secretário(a)",
};

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
  const displayName = user?.name ?? user?.email ?? "";
  const roleLabel = user?.role ? roleLabels[user.role] : undefined;

  async function handleLogout() {
    await logout();
    await refresh();
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-secondary/50"
          title={user?.email ?? undefined}
          aria-label={user?.email ? `Menu do usuário: ${user.email}` : "Menu do usuário"}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-strong bg-secondary text-sm font-medium text-foreground">
            {initial}
          </span>
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="text-sm font-medium text-foreground">{displayName}</span>
            {roleLabel && <span className="text-xs text-muted-foreground">{roleLabel}</span>}
          </span>
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
      <header className="relative flex items-center justify-between border-b bg-card p-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            L
          </span>
          <span className="flex flex-col leading-tight">
            <span className="font-semibold text-primary">Legal Manager</span>
            <span className="text-xs text-muted-foreground">SaaS de Gestão Jurídica</span>
          </span>
        </Link>
        {user && (
          <nav className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-4 whitespace-nowrap text-sm">
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
