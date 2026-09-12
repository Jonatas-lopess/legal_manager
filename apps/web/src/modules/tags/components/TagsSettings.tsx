import * as React from "react";
import { Input } from "@/components/ui/input";
import { createTag, deleteTag, listTags, updateTag, type Tag } from "../tags.controller";

const DEFAULT_COLOR = "#6366f1";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Não foi possível concluir a operação.";
}

type Editing = { mode: "create" } | { mode: "edit"; tag: Tag };

/**
 * Tags tab content (Configurações — ui-shell-clientes-casos-config/04).
 * Inline chip cloud per the drawn frame's compact "OUTRAS CONFIGURAÇÕES
 * (PREVISÃO MVP)" strip (spec.md fidelity check point 5) — same visual
 * family as `TagPicker.tsx`'s attached-tag chips (`casos-detalhe`'s "TAGS DO
 * CASO" row), not a per-row table with a separate color-swatch column.
 * Click-to-edit on the chip itself, no separate actions column. UI-only:
 * `tags.controller.ts` is already real (including whatever `matter_tags`/
 * `deadline_tags` cascade it already runs on delete) — no backend changes
 * here.
 */
export function TagsSettings() {
  const [tags, setTags] = React.useState<Tag[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [nameInput, setNameInput] = React.useState("");
  const [colorInput, setColorInput] = React.useState(DEFAULT_COLOR);

  const load = React.useCallback(async () => {
    try {
      setTags(await listTags());
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setNameInput("");
    setColorInput(DEFAULT_COLOR);
    setEditing({ mode: "create" });
  }

  function openEdit(tag: Tag) {
    setNameInput(tag.name);
    setColorInput(tag.color);
    setEditing({ mode: "edit", tag });
  }

  function cancelEdit() {
    setEditing(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const name = nameInput.trim();
    if (!name || !editing) return;

    setBusy(true);
    setError(null);
    try {
      if (editing.mode === "edit") {
        await updateTag(editing.tag.id, { name, color: colorInput });
      } else {
        await createTag({ name, color: colorInput });
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(tag: Tag) {
    if (!window.confirm(`Excluir a tag "${tag.name}"? Ela será removida de todos os processos e prazos vinculados.`))
      return;

    setBusy(true);
    setError(null);
    try {
      await deleteTag(tag.id);
      setEditing(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!tags) return <p className="text-sm text-muted-foreground">Carregando tags...</p>;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cadastro de Tags Gerais</h2>

      <div className="flex flex-wrap items-center gap-2">
        {tags.map((tag) =>
          editing?.mode === "edit" && editing.tag.id === tag.id ? (
            <form
              key={tag.id}
              onSubmit={handleSubmit}
              className="flex items-center gap-1.5 rounded-full border px-2 py-1"
              style={{ borderColor: colorInput }}
            >
              <input
                type="color"
                value={colorInput}
                onChange={(e) => setColorInput(e.target.value)}
                aria-label={`Cor da tag ${tag.name}`}
                disabled={busy}
                className="h-5 w-5 shrink-0 rounded border border-input bg-transparent p-0"
              />
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                aria-label={`Nome da tag ${tag.name}`}
                className="h-6 w-28 border-none px-1 text-xs shadow-none focus-visible:ring-0"
                autoFocus
                disabled={busy}
              />
              <button
                type="submit"
                className="text-xs font-medium text-foreground disabled:pointer-events-none disabled:opacity-50"
                disabled={busy || !nameInput.trim()}
              >
                Salvar
              </button>
              <button
                type="button"
                className="text-xs text-destructive disabled:pointer-events-none disabled:opacity-50"
                onClick={() => handleDelete(tag)}
                disabled={busy}
              >
                Excluir
              </button>
              <button
                type="button"
                className="text-xs text-muted-foreground disabled:pointer-events-none disabled:opacity-50"
                onClick={cancelEdit}
                disabled={busy}
              >
                ×
              </button>
            </form>
          ) : (
            <button
              key={tag.id}
              type="button"
              onClick={() => openEdit(tag)}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs disabled:pointer-events-none disabled:opacity-50"
              style={{ borderColor: tag.color }}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} aria-hidden="true" />
              {tag.name}
            </button>
          ),
        )}

        {editing?.mode === "create" ? (
          <form onSubmit={handleSubmit} className="flex items-center gap-1.5 rounded-full border border-dashed px-2 py-1">
            <input
              type="color"
              value={colorInput}
              onChange={(e) => setColorInput(e.target.value)}
              aria-label="Cor da nova tag"
              disabled={busy}
              className="h-5 w-5 shrink-0 rounded border border-input bg-transparent p-0"
            />
            <Input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Nome da tag"
              aria-label="Nome da nova tag"
              className="h-6 w-28 border-none px-1 text-xs shadow-none focus-visible:ring-0"
              autoFocus
              disabled={busy}
            />
            <button
              type="submit"
              className="text-xs font-medium text-foreground disabled:pointer-events-none disabled:opacity-50"
              disabled={busy || !nameInput.trim()}
            >
              Adicionar
            </button>
            <button
              type="button"
              className="text-xs text-muted-foreground disabled:pointer-events-none disabled:opacity-50"
              onClick={cancelEdit}
              disabled={busy}
            >
              ×
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={openCreate}
            disabled={busy}
            className="rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground hover:border-solid hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            + Adicionar tag
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
