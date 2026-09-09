import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  attachTagToMatter,
  attachTagToMatterByName,
  detachTagFromMatter,
  listTags,
  listTagsForMatter,
  type Tag,
} from "../tags.controller";

const DEFAULT_COLOR = "#6366f1";

interface TagPickerProps {
  matterId: string;
}

/**
 * Fills `MatterDetailView.tsx`'s `data-slot="matter-tags-panel"` placeholder
 * (ticket 03): the matter's attached-tags chip list (each with a remove
 * control) plus an inline picker that either attaches one of the tenant's
 * existing tags or creates a brand-new one by name — no separate
 * "manage tags" screen (story 24).
 */
export function TagPicker({ matterId }: TagPickerProps) {
  const [attached, setAttached] = React.useState<Tag[]>([]);
  const [allTags, setAllTags] = React.useState<Tag[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [nameInput, setNameInput] = React.useState("");
  const [colorInput, setColorInput] = React.useState(DEFAULT_COLOR);
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setError(null);
    try {
      const [mine, all] = await Promise.all([listTagsForMatter(matterId), listTags()]);
      setAttached(mine);
      setAllTags(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as tags.");
    } finally {
      setLoading(false);
    }
  }, [matterId]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const attachedIds = React.useMemo(() => new Set(attached.map((t) => t.id)), [attached]);
  const availableTags = allTags.filter((t) => !attachedIds.has(t.id));

  async function withBusyGuard(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar as tags.");
    } finally {
      setBusy(false);
    }
  }

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const name = nameInput.trim();
    if (!name) return;

    void withBusyGuard(async () => {
      const existing = availableTags.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        await attachTagToMatter(matterId, existing.id);
      } else {
        await attachTagToMatterByName(matterId, name, colorInput);
      }
      setNameInput("");
      setColorInput(DEFAULT_COLOR);
    });
  }

  function handlePickExisting(tag: Tag) {
    void withBusyGuard(() => attachTagToMatter(matterId, tag.id));
  }

  function handleDetach(tagId: string) {
    void withBusyGuard(() => detachTagFromMatter(matterId, tagId));
  }

  if (loading) return <p className="text-sm text-muted-foreground">Carregando tags...</p>;

  return (
    <div className="flex flex-col gap-3">
      {attached.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma tag anexada ainda.</p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label="Tags anexadas">
          {attached.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs"
              style={{ borderColor: tag.color }}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} aria-hidden="true" />
              {tag.name}
              <button
                type="button"
                aria-label={`Remover tag ${tag.name}`}
                className="text-muted-foreground hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
                disabled={busy}
                onClick={() => handleDetach(tag.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {availableTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {availableTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              disabled={busy}
              className="rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground hover:border-solid hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              onClick={() => handlePickExisting(tag)}
            >
              + {tag.name}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-2">
        <Input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Nova tag ou existente..."
          list="tag-picker-suggestions"
          className="h-8 max-w-[12rem]"
          aria-label="Nome da tag"
          disabled={busy}
        />
        <datalist id="tag-picker-suggestions">
          {availableTags.map((tag) => (
            <option key={tag.id} value={tag.name} />
          ))}
        </datalist>
        <input
          type="color"
          value={colorInput}
          onChange={(e) => setColorInput(e.target.value)}
          aria-label="Cor da nova tag"
          disabled={busy}
          className="h-8 w-8 rounded border border-input bg-transparent p-1"
        />
        <Button type="submit" size="sm" variant="outline" disabled={busy || !nameInput.trim()}>
          Adicionar
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
