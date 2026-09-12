import * as React from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCatalogItem, deleteCatalogItem, listCatalogItems, updateCatalogItem, type CatalogItem } from "../catalog.controller";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Não foi possível concluir a operação.";
}

/**
 * Catálogo tab content (Configurações — ui-shell-clientes-casos-config/04).
 * Compact bullet-line list per the drawn frame's "OUTRAS CONFIGURAÇÕES
 * (PREVISÃO MVP)" strip (spec.md fidelity check point 5) — not the
 * filterable data table an earlier draft of this ticket assumed. UI-only:
 * `catalog.controller.ts` is already real, no backend changes here.
 */
export function CatalogSettings() {
  const [items, setItems] = React.useState<CatalogItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [createValue, setCreateValue] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      setItems(await listCatalogItems());
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  function startEdit(item: CatalogItem) {
    setCreating(false);
    setEditingId(item.id);
    setEditValue(item.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue("");
  }

  async function handleSaveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    const name = editValue.trim();
    if (!name) return;

    setBusy(true);
    setError(null);
    try {
      await updateCatalogItem(editingId, { name });
      cancelEdit();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(item: CatalogItem) {
    if (!window.confirm(`Excluir o item de catálogo "${item.name}"?`)) return;

    setBusy(true);
    setError(null);
    try {
      await deleteCatalogItem(item.id);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setCreateValue("");
    setCreating(true);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const name = createValue.trim();
    if (!name) return;

    setBusy(true);
    setError(null);
    try {
      await createCatalogItem({ name });
      setCreating(false);
      setCreateValue("");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!items) return <p className="text-sm text-muted-foreground">Carregando catálogo...</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Catálogo de Demandas</h2>
        <Button size="sm" variant="outline" onClick={openCreate} disabled={busy}>
          <Plus className="h-3.5 w-3.5" />
          Novo item
        </Button>
      </div>

      {items.length === 0 && !creating ? (
        <p className="text-sm text-muted-foreground">Nenhum item cadastrado ainda.</p>
      ) : (
        <ul className="flex flex-col text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 border-b py-2 last:border-0">
              {editingId === item.id ? (
                <form onSubmit={handleSaveEdit} className="flex flex-1 items-center gap-2">
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="h-8"
                    aria-label={`Renomear ${item.name}`}
                    autoFocus
                    disabled={busy}
                  />
                  <Button type="submit" size="sm" disabled={busy || !editValue.trim()}>
                    Salvar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={cancelEdit} disabled={busy}>
                    Cancelar
                  </Button>
                </form>
              ) : (
                <>
                  <span>
                    · {item.name} — Criado em <span className="font-mono">{formatDate(item.createdAt)}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${item.name}`}
                      onClick={() => startEdit(item)}
                      disabled={busy}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Excluir ${item.name}`}
                      onClick={() => handleDelete(item)}
                      disabled={busy}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <form onSubmit={handleCreate} className="flex items-center gap-2">
          <Input
            value={createValue}
            onChange={(e) => setCreateValue(e.target.value)}
            placeholder="Nome do item de catálogo"
            className="h-8 max-w-xs"
            aria-label="Nome do novo item de catálogo"
            autoFocus
            disabled={busy}
          />
          <Button type="submit" size="sm" disabled={busy || !createValue.trim()}>
            Adicionar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)} disabled={busy}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
