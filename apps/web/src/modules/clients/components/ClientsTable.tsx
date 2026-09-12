import * as React from "react";
import { Archive, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TABLE_HEADER_ROW_CLASS } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { listClients, softDeleteClient, clientStatuses, type Client, type ClientStatus } from "../clients.controller";
import { ClientDialog } from "./ClientDialog";

const statusLabels: Record<ClientStatus, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
};

// Monochrome slate + uppercase label pill — same shape/rule as every other
// status pill in this app (see `PrazosPage.tsx`'s `BADGE_CLASS`): never
// color-coded, text content stays normal-case and `uppercase` is applied via
// CSS so the source string ("Ativo"/"Inativo") stays readable in code/tests.
const BADGE_CLASS = "rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-foreground";

const COLUMN_COUNT = 6;

export function ClientsTable() {
  const [clients, setClients] = React.useState<Client[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<ClientStatus | "">("");
  const [dialogState, setDialogState] = React.useState<{ mode: "create" | "edit"; client: Client | null } | null>(
    null,
  );

  const fetchClients = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listClients({ search: search || undefined, status: statusFilter || undefined });
      setClients(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os clientes.");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  // Debounced re-fetch on search/filter change — a plain setTimeout is
  // enough at this list size; no need for a shared debounce hook yet.
  React.useEffect(() => {
    const timer = setTimeout(fetchClients, 250);
    return () => clearTimeout(timer);
  }, [fetchClients]);

  function openCreateDialog() {
    setDialogState({ mode: "create", client: null });
  }

  async function handleArchive(client: Client) {
    if (!window.confirm(`Arquivar o cliente "${client.name}"? O registro é mantido para fins de auditoria.`)) return;
    try {
      await softDeleteClient(client.id);
      await fetchClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível arquivar o cliente.");
    }
  }

  return (
    <div className="flex w-full flex-col gap-4" data-testid="clients-table">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Clientes</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar por nome ou documento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          <select
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ClientStatus | "")}
          >
            <option value="">Todos os status</option>
            {clientStatuses.map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </select>
          <Button onClick={openCreateDialog}>Novo cliente</Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className={TABLE_HEADER_ROW_CLASS}>
                <th className="p-3 font-medium uppercase">Nome / Razão social</th>
                <th className="p-3 font-medium uppercase">CPF/CNPJ</th>
                <th className="p-3 font-medium uppercase">Telefone</th>
                <th className="p-3 font-medium uppercase">E-mail</th>
                <th className="p-3 font-medium uppercase">Status</th>
                <th className="p-3 text-right font-medium uppercase">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td colSpan={COLUMN_COUNT} className="p-3">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={COLUMN_COUNT} className="p-10">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
                      <Button onClick={openCreateDialog}>Novo cliente</Button>
                    </div>
                  </td>
                </tr>
              ) : (
                clients.map((client) => {
                  // Archived rows render muted. The real, reachable signal is
                  // `status === "inativo"` — `listClients()`
                  // (clients.repository.ts) always filters `deleted_at is
                  // null`, so `deletedAt` is never set on any row this
                  // component receives (confirmed by
                  // clients.service.test.ts's "soft-delete hides from the
                  // default list" case). The `deletedAt` check below is
                  // defensive/future-proofing only — a no-op today — kept so
                  // this still matches the wireframe's literal wording if
                  // that filter ever changes. See ticket 02's Comments.
                  const muted = client.status === "inativo" || client.deletedAt !== null;
                  return (
                    <tr
                      key={client.id}
                      className={cn("border-b last:border-0", muted && "text-muted-foreground opacity-70")}
                    >
                      <td className="p-3 font-semibold">{client.name}</td>
                      <td className="p-3">{client.cpf || client.cnpj || "—"}</td>
                      <td className="p-3">{client.phone || "—"}</td>
                      <td className="p-3">{client.email || "—"}</td>
                      <td className="p-3">
                        <span className={BADGE_CLASS}>{statusLabels[client.status]}</span>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Editar ${client.name}`}
                            onClick={() => setDialogState({ mode: "edit", client })}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Arquivar ${client.name}`}
                            onClick={() => handleArchive(client)}
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {dialogState && (
        <ClientDialog
          open
          mode={dialogState.mode}
          client={dialogState.client}
          onOpenChange={(open) => !open && setDialogState(null)}
          onSaved={fetchClients}
        />
      )}
    </div>
  );
}
