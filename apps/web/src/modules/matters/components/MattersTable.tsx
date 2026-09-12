import * as React from "react";
import { useLocation } from "wouter";
import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listMatters, softDeleteMatter, matterStatuses, type Matter, type MatterStatus } from "../matters.controller";
import { listClients, type Client } from "../../clients/clients.controller";
import { listCatalogItems, type CatalogItem } from "../../catalog/catalog.controller";
import { MatterDialog } from "./MatterDialog";
import { matterCatalogLabel } from "./matterCatalogLabel";

const statusLabels: Record<MatterStatus, string> = {
  rascunho: "Rascunho",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  arquivado: "Arquivado",
};

// Monochrome slate + uppercase label for every status pill — same deliberate
// design-token decision dashboard-reports' Prazos page already applies
// (search "no red/amber/green anywhere" in spec.md), not a per-status color.
const STATUS_PILL_CLASS = "rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-foreground";

/** "UF / Comarca / Município" — casos-lista's third column, a single
 * composed cell rather than three separate columns (the wireframe draws
 * one column for all three). Omits comarca/município when unset (a
 * `rascunho` matter may only have `uf`). */
function jurisdicaoLabel(matter: Matter): string {
  return [matter.uf, matter.comarca, matter.municipio].filter(Boolean).join(" / ");
}

const SKELETON_ROW_COUNT = 4;

export function MattersTable() {
  const [, navigate] = useLocation();
  const [matters, setMatters] = React.useState<Matter[]>([]);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [catalogItems, setCatalogItems] = React.useState<CatalogItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<MatterStatus | "">("");
  const [clientFilter, setClientFilter] = React.useState("");
  const [dialogState, setDialogState] = React.useState<{ mode: "create" | "edit"; matter: Matter | null } | null>(
    null,
  );

  const clientNameById = React.useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  const catalogItemById = React.useMemo(() => new Map(catalogItems.map((c) => [c.id, c])), [catalogItems]);

  React.useEffect(() => {
    listClients().then(setClients).catch(() => {});
    listCatalogItems().then(setCatalogItems).catch(() => {});
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

  function openCreateDialog() {
    setDialogState({ mode: "create", matter: null });
  }

  async function handleArchive(matter: Matter, e: React.MouseEvent) {
    e.stopPropagation();
    const label = matterCatalogLabel(matter, matter.matterCatalogItemId ? catalogItemById.get(matter.matterCatalogItemId) : undefined);
    if (!window.confirm(`Arquivar o caso "${label}"? O registro é mantido para fins de auditoria.`)) return;
    try {
      await softDeleteMatter(matter.id);
      await fetchMatters();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível arquivar o caso.");
    }
  }

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4" data-testid="matters-table">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Casos</h1>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <Input
            placeholder="Buscar por número ou título..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-xs"
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
          <Button onClick={openCreateDialog}>Novo caso</Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <table className="w-full text-sm">
              <tbody>
                {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-3" colSpan={5}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : matters.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <p className="text-sm text-muted-foreground">Nenhum caso encontrado.</p>
              <Button onClick={openCreateDialog}>Novo caso</Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-3 font-medium">Cliente</th>
                  <th className="p-3 font-medium">Item de catálogo / Processo</th>
                  <th className="p-3 font-medium">UF / Comarca / Município</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {matters.map((matter) => (
                  <tr
                    key={matter.id}
                    onClick={() => navigate(`/matters/${matter.id}`)}
                    className="cursor-pointer border-b last:border-0 hover:bg-secondary/50"
                  >
                    <td className="p-3">{matter.clientId ? (clientNameById.get(matter.clientId) ?? "—") : "—"}</td>
                    <td className="p-3">
                      {matterCatalogLabel(
                        matter,
                        matter.matterCatalogItemId ? catalogItemById.get(matter.matterCatalogItemId) : undefined,
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{jurisdicaoLabel(matter)}</td>
                    <td className="p-3">
                      <span className={STATUS_PILL_CLASS}>{statusLabels[matter.status]}</span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Arquivar caso`}
                          onClick={(e) => handleArchive(matter, e)}
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                        <span className="self-center text-muted-foreground">›</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

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
