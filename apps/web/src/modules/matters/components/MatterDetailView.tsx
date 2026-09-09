import * as React from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMatter, type Matter, type MatterStatus } from "../matters.controller";
import { MatterDialog } from "./MatterDialog";
import { TagPicker } from "../../tags/components/TagPicker";
import { PaymentPanel } from "../../payments/components/PaymentPanel";

const statusLabels: Record<MatterStatus, string> = {
  rascunho: "Rascunho",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  arquivado: "Arquivado",
};

/**
 * Matter detail view — the anchor tickets 04 (tags) and 05 (payments) attach
 * their panels to. Sectioned as: core fields (this ticket, reuses
 * `MatterDialog` for editing) + two clearly-delineated placeholder sections
 * below. Do not build tag/payment UI here — that's out of scope for this
 * ticket; tickets 04/05 extend the two named slots in place.
 */
export function MatterDetailView() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [matter, setMatter] = React.useState<Matter | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);

  const fetchMatter = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setMatter(await getMatter(id));
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

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4" data-testid="matter-detail-view">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/matters")}>
          ← Processos
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          Editar
        </Button>
      </div>

      {/* Core fields section */}
      <Card>
        <CardHeader>
          <CardTitle>Dados do processo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Status: </span>
            {statusLabels[matter.status]}
          </div>
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
          <div className="sm:col-span-2">
            <span className="text-muted-foreground">Descrição: </span>
            {matter.description ?? "—"}
          </div>
          {matter.deletedAt && (
            <div className="sm:col-span-2 text-destructive">Processo excluído em {matter.deletedAt}.</div>
          )}
        </CardContent>
      </Card>

      {/* Tags slot — filled by ticket 04 (tags-matter-tagging). TagPicker
          (apps/web/src/modules/tags/components/TagPicker.tsx) owns the
          attached-tags chip list, remove-per-chip control, and the inline
          add-existing-or-create-new picker. */}
      <Card data-slot="matter-tags-panel">
        <CardHeader>
          <CardTitle>Tags</CardTitle>
        </CardHeader>
        <CardContent>
          <TagPicker matterId={matter.id} />
        </CardContent>
      </Card>

      {/* Payments slot — filled by ticket 05 (payments-matter-scoped-role-
          gated). PaymentPanel (apps/web/src/modules/payments/components/
          PaymentPanel.tsx) owns the payment list, create form, and
          per-row status-toggle, and hides itself entirely for `secretario`
          (PLANNING §8) via its own `getCurrentUser()` check. */}
      <Card data-slot="matter-payments-panel">
        <CardHeader>
          <CardTitle>Financeiro</CardTitle>
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
          onSaved={(saved) => setMatter(saved)}
        />
      )}
    </div>
  );
}
