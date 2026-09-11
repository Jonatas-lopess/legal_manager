import { Link, Route, Switch, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { AuthProvider, useAuth } from "@/modules/tenants/components/AuthProvider";
import { LoginForm } from "@/modules/tenants/components/LoginForm";
import { MembersTable } from "@/modules/tenants/components/MembersTable";
import { RequireAuth } from "@/modules/tenants/components/RequireAuth";
import { ResetPasswordForm } from "@/modules/tenants/components/ResetPasswordForm";
import { logout } from "@/modules/tenants/tenants.controller";
import { ClientsTable } from "@/modules/clients/components/ClientsTable";
import { MattersTable } from "@/modules/matters/components/MattersTable";
import { MatterDetailView } from "@/modules/matters/components/MatterDetailView";
import { DeadlinesTable } from "@/modules/deadlines/components/DeadlinesTable";
import { NotificationsDropdown } from "@/modules/notifications/components/NotificationsDropdown";
import { DashboardNav } from "@/modules/reports/components/DashboardNav";
import { MetricasPage } from "@/modules/reports/components/MetricasPage";
import { PrazosPage } from "@/modules/reports/components/PrazosPage";

const moduleRoutes = [
  { path: "/clients", label: "Clientes" },
  { path: "/catalog", label: "Catálogo" },
  { path: "/matters", label: "Casos" },
  { path: "/deadlines", label: "Prazos" },
  { path: "/payments", label: "Financeiro" },
  { path: "/audit", label: "Auditoria" },
  { path: "/dashboard/metricas", label: "Painel" },
];

function AppShell({ children }: { children: React.ReactNode }) {
  const { user, refresh } = useAuth();
  const [location] = useLocation();
  // The two dashboard routes (reports module) supply their own top bar via
  // DashboardNav — a separate nav shape from the rest of the app (logo +
  // "Métricas"/"Prazos" links + user chip + its own "Sair", no left sidebar,
  // no NotificationsDropdown, per dashboard-reports/spec.md's "Nav shape"
  // decision) — so AppShell's own header is skipped there instead of
  // stacking two bars.
  const isDashboardRoute = location.startsWith("/dashboard");

  return (
    <div className="flex min-h-screen flex-col">
      {isDashboardRoute ? (
        user && <DashboardNav />
      ) : (
        <header className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-semibold">
              Legal Manager
            </Link>
            {user && (
              <nav className="flex gap-4 text-sm text-muted-foreground">
                {moduleRoutes.map(({ path, label }) => (
                  <Link key={path} href={path} className="hover:text-foreground hover:underline">
                    {label}
                  </Link>
                ))}
              </nav>
            )}
          </div>
          {user && (
            <div className="flex items-center gap-2">
              <NotificationsDropdown />
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
          )}
        </header>
      )}
      <main className="flex flex-1 items-start justify-center p-6">{children}</main>
    </div>
  );
}

function ProtectedApp() {
  return (
    <RequireAuth>
      <Switch>
        <Route path="/clients">
          <ClientsTable />
        </Route>
        <Route path="/matters/:id">
          <MatterDetailView />
        </Route>
        <Route path="/matters">
          <MattersTable />
        </Route>
        <Route path="/deadlines">
          <DeadlinesTable />
        </Route>
        <Route path="/dashboard/metricas">
          <MetricasPage />
        </Route>
        <Route path="/dashboard/prazos">
          <PrazosPage />
        </Route>
        {moduleRoutes
          .filter(
            ({ path }) =>
              path !== "/clients" && path !== "/matters" && path !== "/deadlines" && path !== "/dashboard/metricas",
          )
          .map(({ path, label }) => (
            <Route key={path} path={path}>
              <div>{label}</div>
            </Route>
          ))}
        <Route path="/">
          <MembersTable />
        </Route>
      </Switch>
    </RequireAuth>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppShell>
        <Switch>
          <Route path="/login">
            <LoginForm />
          </Route>
          <Route path="/reset-password">
            <ResetPasswordForm />
          </Route>
          <Route>
            <ProtectedApp />
          </Route>
        </Switch>
      </AppShell>
    </AuthProvider>
  );
}

export default App;
