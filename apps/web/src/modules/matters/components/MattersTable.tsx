import * as React from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listMatters, softDeleteMatter, matterStatuses, type Matter, type MatterStatus } from "../matters.controller";
import { listClients, type Client } from "../../clients/clients.controller";
import { MatterDialog } from "./MatterDialog";

const statusLabels: Record<MatterStatus, string> = {
  rascunho: "Rascunho",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  arquivado: "Arquivado",
};

export function MattersTable() {
  const [, navigate] = useLocation();
  const [matters, setMatters] = React.useState<Matter[]>([]);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<MatterStatus | "">("");
  const [clientFilter, setClientFilter] = React.useState("");
  const [dialogState, setDialogState] = React.useState<{ mode: "create" | "edit"; matter: Matter | null } | null>(
    null,
  );

  const clientNameById = React.useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

  React.useEffect(() => {
    listClients().then(setClients).catch(() => {});
  }, []);

  const fetchMatters = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listMatters({
        search: search || undefined,
        status: statusFilter || undefined,
        clientId: clientFilter || undefined,
      });
      setMatters(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os processos.");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, clientFilter]);

  // Debounced re-fetch on search/filter change — same small-list-size call
  // ClientsTable already made; no shared debounce hook exists yet.
  React.useEffect(() => {
    const timer = setTimeout(fetchMatters, 250);
    return () => clearTimeout(timer);
  }, [fetchMatters]);

  async function handleSoftDelete(matter: Matter) {
    if (!window.confirm("Excluir este processo? O registro é mantido para fins de auditoria.")) return;
    try {
      await softDeleteMatter(matter.id);
      await fetchMatters();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir o processo.");
    }
  }

  return (
    <div className="flex w-full max-w-4xl flex-col gap-4" data-testid="matters-table">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Processos</h1>
        <Button onClick={() => setDialogState({ mode: "create", matter: null })}>Novo processo</Button>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Buscar por descrição, UF, comarca ou município"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <select
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as MatterStatus | "")}
        >
          <option value="">Todos os status</option>
          {matterStatuses.map((s) => (
            <option key={s} value={s}>
              {statusLabels[s]}
            </option>
          ))}
        </select>
        <select
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
        >
          <option value="">Todos os clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
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
        ) : matters.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhum processo encontrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3 font-medium">Cliente</th>
                <th className="p-3 font-medium">UF</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {matters.map((matter) => (
                <tr key={matter.id} className="border-b last:border-0">
                  <td className="p-3">
                    {matter.clientId ? (clientNameById.get(matter.clientId) ?? "—") : "—"}
                  </td>
                  <td className="p-3 text-muted-foreground">{matter.uf}</td>
                  <td className="p-3">{statusLabels[matter.status]}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => navigate(`/matters/${matter.id}`)}>
                        Ver
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDialogState({ mode: "edit", matter })}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleSoftDelete(matter)}>
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
        <MatterDialog
          open
          mode={dialogState.mode}
          matter={dialogState.matter}
          onOpenChange={(open) => !open && setDialogState(null)}
          onSaved={fetchMatters}
        />
      )}
    </div>
  );
}
