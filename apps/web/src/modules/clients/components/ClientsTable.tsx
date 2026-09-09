import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listClients, softDeleteClient, clientStatuses, type Client, type ClientStatus } from "../clients.controller";
import { ClientDialog } from "./ClientDialog";

const statusLabels: Record<ClientStatus, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
};

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

  async function handleSoftDelete(client: Client) {
    if (!window.confirm(`Excluir o cliente "${client.name}"? O registro é mantido para fins de auditoria.`)) return;
    try {
      await softDeleteClient(client.id);
      await fetchClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir o cliente.");
    }
  }

  return (
    <div className="flex w-full max-w-4xl flex-col gap-4" data-testid="clients-table">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Clientes</h1>
        <Button onClick={() => setDialogState({ mode: "create", client: null })}>Novo cliente</Button>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Buscar por nome, CPF ou CNPJ"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
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
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="rounded-xl border">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Carregando...</p>
        ) : clients.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3 font-medium">Nome</th>
                <th className="p-3 font-medium">CPF/CNPJ</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="border-b last:border-0">
                  <td className="p-3">{client.name}</td>
                  <td className="p-3 text-muted-foreground">{client.cpf || client.cnpj || "—"}</td>
                  <td className="p-3">{statusLabels[client.status]}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setDialogState({ mode: "edit", client })}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleSoftDelete(client)}>
                        Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
