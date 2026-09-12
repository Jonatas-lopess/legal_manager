import { Redirect, Route, Switch } from "wouter";
import { AuthProvider } from "@/modules/tenants/components/AuthProvider";
import { LoginForm } from "@/modules/tenants/components/LoginForm";
import { RequireAuth } from "@/modules/tenants/components/RequireAuth";
import { ResetPasswordForm } from "@/modules/tenants/components/ResetPasswordForm";
import { ClientsTable } from "@/modules/clients/components/ClientsTable";
import { MattersTable } from "@/modules/matters/components/MattersTable";
import { MatterDetailView } from "@/modules/matters/components/MatterDetailView";
import { DeadlinesTable } from "@/modules/deadlines/components/DeadlinesTable";
import { MetricasPage } from "@/modules/reports/components/MetricasPage";
import { PrazosPage } from "@/modules/reports/components/PrazosPage";
import { AppShell } from "@/components/AppShell";
import { SettingsPage } from "@/components/SettingsPage";

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
        <Route path="/settings">
          <SettingsPage />
        </Route>
        <Route path="/">
          <Redirect to="/dashboard/metricas" />
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
