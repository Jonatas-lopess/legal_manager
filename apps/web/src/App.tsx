import { Route, Switch } from "wouter";
import { Button } from "@/components/ui/button";
import { AuthProvider, useAuth } from "@/modules/tenants/components/AuthProvider";
import { LoginForm } from "@/modules/tenants/components/LoginForm";
import { MembersTable } from "@/modules/tenants/components/MembersTable";
import { RequireAuth } from "@/modules/tenants/components/RequireAuth";
import { ResetPasswordForm } from "@/modules/tenants/components/ResetPasswordForm";
import { logout } from "@/modules/tenants/tenants.controller";

const moduleRoutes = [
  { path: "/clients", label: "Clientes" },
  { path: "/catalog", label: "Catálogo" },
  { path: "/matters", label: "Casos" },
  { path: "/deadlines", label: "Prazos" },
  { path: "/payments", label: "Financeiro" },
  { path: "/audit", label: "Auditoria" },
];

function AppShell({ children }: { children: React.ReactNode }) {
  const { user, refresh } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b p-4">
        <span className="font-semibold">Legal Manager</span>
        {user && (
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
        )}
      </header>
      <main className="flex flex-1 items-start justify-center p-6">{children}</main>
    </div>
  );
}

function ProtectedApp() {
  return (
    <RequireAuth>
      <Switch>
        {moduleRoutes.map(({ path, label }) => (
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
