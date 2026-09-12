import * as React from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMatter, type Matter, type MatterStatus } from "../matters.controller";
import { getClient, type Client } from "../../clients/clients.controller";
import { getCatalogItem, type CatalogItem } from "../../catalog/catalog.controller";
import { MatterDialog } from "./MatterDialog";
import { matterCatalogLabel } from "./matterCatalogLabel";
import { TagPicker } from "../../tags/components/TagPicker";
import { PaymentPanel } from "../../payments/components/PaymentPanel";
import { MatterPrazosCard } from "../../deadlines/components/MatterPrazosCard";

const statusLabels: Record<MatterStatus, string> = {
  rascunho: "Rascunho",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  arquivado: "Arquivado",
};

const STATUS_PILL_CLASS = "rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-foreground";

/**
 * Matter detail view (casos-detalhe wireframe, ticket 03 of
 * ui-shell-clientes-casos-config) — page title composed from the client's
 * name + the same `matterCatalogLabel` helper casos-lista's second column
 * uses, then stacked full-width cards: Dados do processo (core fields +
 * the new Número CNJ field), Prazos (new, matter-scoped, see
 * `MatterPrazosCard`), Tags do caso (`TagPicker`, unchanged logic), and
 * Financeiro e pagamentos (`PaymentPanel`, unchanged logic — hides itself
 * for `secretario`).
 */
export function MatterDetailView() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [matter, setMatter] = React.useState<Matter | null>(null);
  const [client, setClient] = React.useState<Client | null>(null);
  const [catalogItem, setCatalogItem] = React.useState<CatalogItem | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);

  const fetchMatter = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const found = await getMatter(id);
      setMatter(found);
      const [foundClient, foundCatalogItem] = await Promise.all([
        found?.clientId ? getClient(found.clientId) : Promise.resolve(null),
        found?.matterCatalogItemId ? getCatalogItem(found.matterCatalogItemId) : Promise.resolve(null),
      ]);
      setClient(foundClient);
      setCatalogItem(foundCatalogItem);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o processo.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    fetchMatter();
  }, [fetchMatter]);

  if (loading) return <p className="p-4 text-sm text-muted-foreground">Carregando...</p>;
  if (error) return <p role="alert" className="p-4 text-sm text-destructive">{error}</p>;
  if (!matter) return <p className="p-4 text-sm text-muted-foreground">Processo não encontrado.</p>;

  const pageTitle = `${client?.name ?? "Sem cliente"} — ${matterCatalogLabel(matter, catalogItem ?? undefined)}`;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4" data-testid="matter-detail-view">
      {matter.deletedAt && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">
            Processo excluído em {matter.deletedAt}.
          </CardContent>
        </Card>
      )}

      <h1 className="text-xl font-semibold">{pageTitle}</h1>

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/matters")}>
          ← Casos
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          Editar caso
        </Button>
      </div>

      {/* Dados do processo */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Dados do processo
          </CardTitle>
          <span className={STATUS_PILL_CLASS}>{statusLabels[matter.status]}</span>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">UF: </span>
              {matter.uf}
            </div>
            <div>
              <span className="text-muted-foreground">Comarca: </span>
              {matter.comarca ?? "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Município: </span>
              {matter.municipio ?? "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Número CNJ: </span>
              <span className="font-mono">{matter.numeroCnj ?? "—"}</span>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Descrição detalhada</p>
            <p className="mt-1">{matter.description ?? "—"}</p>
          </div>
        </CardContent>
      </Card>

      {/* Prazos — matter-scoped, ticket 03's new card. */}
      <MatterPrazosCard matterId={matter.id} />

      {/* Tags slot */}
      <Card data-slot="matter-tags-panel">
        <CardHeader>
          <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tags do caso
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TagPicker matterId={matter.id} />
        </CardContent>
      </Card>

      {/* Payments slot */}
      <Card data-slot="matter-payments-panel">
        <CardHeader>
          <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Financeiro e pagamentos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentPanel matterId={matter.id} />
        </CardContent>
      </Card>

      {editOpen && (
        <MatterDialog
          open
          mode="edit"
          matter={matter}
          onOpenChange={setEditOpen}
          onSaved={() => {
            // Re-fetches client/catalog item too, not just the matter row —
            // an edit can change clientId/matterCatalogItemId, which the
            // page title and the composed label both depend on.
            void fetchMatter();
          }}
        />
      )}
    </div>
  );
}
