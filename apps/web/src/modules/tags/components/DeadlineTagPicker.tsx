import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  attachTagToDeadline,
  attachTagToDeadlineByName,
  detachTagFromDeadline,
  listTags,
  listTagsForDeadline,
  type Tag,
} from "../tags.controller";

const DEFAULT_COLOR = "#6366f1";

interface DeadlineTagPickerProps {
  deadlineId: string;
}

/**
 * Deadline-tagging sibling of `TagPicker.tsx` (ticket 03 of
 * deadlines-engine-alerts) — same chip list + inline attach-existing-or-
 * create-new picker, pointed at `deadline_tags` instead of `matter_tags`.
 * A parameterized single component was considered (entityType + two sets of
 * controller functions as props) but this codebase's own precedent — the DB
 * modeling `matter_tags`/`deadline_tags` as separate tables with separate
 * repository functions rather than a generic "taggable" join — favors a
 * few similar lines over a shared abstraction here too, so this file is a
 * deliberate near-duplicate of TagPicker.tsx rather than a generalization
 * of it. Tagging never touches `dueDate`/`isFatal`/`countingMode` (ADR-0003)
 * — this component only ever calls the tag-attachment functions above.
 */
export function DeadlineTagPicker({ deadlineId }: DeadlineTagPickerProps) {
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
      const [mine, all] = await Promise.all([listTagsForDeadline(deadlineId), listTags()]);
      setAttached(mine);
      setAllTags(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as tags.");
    } finally {
      setLoading(false);
    }
  }, [deadlineId]);

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
        await attachTagToDeadline(deadlineId, existing.id);
      } else {
        await attachTagToDeadlineByName(deadlineId, name, colorInput);
      }
      setNameInput("");
      setColorInput(DEFAULT_COLOR);
    });
  }

  function handlePickExisting(tag: Tag) {
    void withBusyGuard(() => attachTagToDeadline(deadlineId, tag.id));
  }

  function handleDetach(tagId: string) {
    void withBusyGuard(() => detachTagFromDeadline(deadlineId, tagId));
  }

  if (loading) return <p className="text-sm text-muted-foreground">Carregando tags...</p>;

  return (
    <div className="flex flex-col gap-2">
      {attached.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem tags.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags anexadas">
          {attached.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
              style={{ borderColor: tag.color }}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} aria-hidden="true" />
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
        <div className="flex flex-wrap gap-1.5">
          {availableTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              disabled={busy}
              className="rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:border-solid hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              onClick={() => handlePickExisting(tag)}
            >
              + {tag.name}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-1.5">
        <Input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Nova tag..."
          list={`deadline-tag-suggestions-${deadlineId}`}
          className="h-7 max-w-[9rem] text-xs"
          aria-label="Nome da tag"
          disabled={busy}
        />
        <datalist id={`deadline-tag-suggestions-${deadlineId}`}>
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
          className="h-7 w-7 rounded border border-input bg-transparent p-0.5"
        />
        <Button type="submit" size="sm" variant="outline" disabled={busy || !nameInput.trim()} className="h-7 px-2 text-xs">
          +
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
