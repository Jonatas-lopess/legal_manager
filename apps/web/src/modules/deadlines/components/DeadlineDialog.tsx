import * as React from "react";
import { Dialog } from "radix-ui";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDeadline, updateDeadline, countingModes, type CountingMode, type Deadline } from "../deadlines.controller";
import { createDeadlineInputSchema } from "../deadlines.schema";
import { listMatters, type Matter } from "../../matters/matters.controller";

type FormInput = z.input<typeof createDeadlineInputSchema>;
type FormOutput = z.output<typeof createDeadlineInputSchema>;

const countingModeLabels: Record<CountingMode, string> = {
  dias_uteis: "Dias úteis",
  dias_corridos: "Dias corridos",
};

/** Matters have no simple "name" field — mirrors how MattersTable.tsx/
 * DeadlinesTable.tsx label a matter for a picker: UF plus description (or
 * the id's first segment when there's no description yet). */
function matterLabel(matter: Matter): string {
  return `${matter.uf} — ${matter.description ?? matter.id.slice(0, 8)}`;
}

function toFormValues(deadline: Deadline | null, initialMatterId?: string): FormInput {
  return {
    matterId: deadline?.matterId ?? initialMatterId ?? "",
    countingMode: deadline?.countingMode ?? "dias_uteis",
    days: deadline?.days ?? 1,
    isFatal: deadline?.isFatal ?? false,
    startDate: deadline?.startDate ?? "",
    description: deadline?.description ?? "",
  };
}

interface DeadlineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  deadline: Deadline | null;
  onSaved: (deadline: Deadline) => void;
  /** Pre-fills the matter picker for a create opened from a matter-scoped
   * context (casos-detalhe's Prazos card) — reuses this same dialog/field
   * set rather than a standalone rebuild (ticket 03). Ignored in edit mode
   * (the deadline's own `matterId` wins) and still just pre-fills the
   * `<select>`, which stays changeable like every other field here. */
  initialMatterId?: string;
}

export function DeadlineDialog({ open, onOpenChange, mode, deadline, onSaved, initialMatterId }: DeadlineDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {open && (
        <DeadlineDialogContent
          mode={mode}
          deadline={deadline}
          onSaved={onSaved}
          onOpenChange={onOpenChange}
          initialMatterId={initialMatterId}
        />
      )}
    </Dialog.Root>
  );
}

function DeadlineDialogContent({
  mode,
  deadline,
  onSaved,
  onOpenChange,
  initialMatterId,
}: {
  mode: "create" | "edit";
  deadline: Deadline | null;
  onSaved: (deadline: Deadline) => void;
  onOpenChange: (open: boolean) => void;
  initialMatterId?: string;
}) {
  const [formError, setFormError] = React.useState<string | null>(null);
  // Story 3: the computed due_date, surfaced right in the dialog once a
  // save succeeds, rather than trusting the caller to notice it in the
  // table after the dialog closes.
  const [savedDueDate, setSavedDueDate] = React.useState<string | null>(null);
  // Matter picker — fetched once per dialog open via matters.controller
  // (cross-module, controller-only per PLANNING §6), same pattern
  // MatterDialog.tsx uses for its client/catalog pickers.
  const [matters, setMatters] = React.useState<Matter[]>([]);

  React.useEffect(() => {
    listMatters().then(setMatters).catch(() => {});
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createDeadlineInputSchema),
    defaultValues: toFormValues(deadline, initialMatterId),
  });

  const onSubmit: SubmitHandler<FormOutput> = async (data) => {
    setFormError(null);
    try {
      let saved: Deadline | null;
      if (mode === "create") {
        saved = await createDeadline(data);
      } else if (deadline) {
        // `defaultValues` pre-fills every field with the deadline's current
        // value, so `data` always has all of them populated — sending it
        // wholesale would make deadlines.service.ts's updateDeadline think
        // every due_date-affecting field was "touched" on every edit (even
        // one that only changed `description`/`isFatal`), triggering a
        // recompute that could silently shift due_date if holidays changed
        // since creation. Only forward what the user actually edited.
        const patch: Partial<FormOutput> = {};
        for (const key of Object.keys(dirtyFields) as (keyof FormOutput)[]) {
          // TS can't correlate `key`/`data[key]` pointwise across a union
          // key type inside a loop — the runtime access is sound (`key`
          // always comes from `dirtyFields`, a subset of `data`'s own keys).
          if (dirtyFields[key]) (patch as Record<string, unknown>)[key] = data[key];
        }
        saved = await updateDeadline(deadline.id, patch);
      } else {
        return;
      }
      onSaved(saved);
      setSavedDueDate(saved.dueDate);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não foi possível salvar o prazo.");
    }
  };

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/50" />
      <Dialog.Content className="fixed top-1/2 left-1/2 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-card p-6 text-card-foreground shadow">
        <Dialog.Title className="font-semibold leading-none tracking-tight">
          {mode === "create" ? "Novo prazo" : "Editar prazo"}
        </Dialog.Title>
        <Dialog.Description className="mt-1.5 text-sm text-muted-foreground">
          {mode === "create"
            ? "O vencimento é calculado automaticamente a partir da data de início, do modo de contagem e dos dias informados."
            : "Alterar data de início, modo de contagem ou dias recalcula o vencimento automaticamente."}
        </Dialog.Description>

        {savedDueDate ? (
          <div className="mt-4 flex flex-col gap-3">
            <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Prazo salvo. Vencimento calculado: <strong>{savedDueDate}</strong>.
            </p>
            <div className="flex justify-end">
              <Button type="button" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="deadline-matter">Processo *</Label>
              <select
                id="deadline-matter"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                {...register("matterId")}
              >
                <option value="">Selecione um processo</option>
                {matters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {matterLabel(m)}
                  </option>
                ))}
              </select>
              {errors.matterId && (
                <p role="alert" className="text-xs text-destructive">
                  {errors.matterId.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="deadline-description">Descrição *</Label>
              <Input id="deadline-description" placeholder="Ex.: Contestação" {...register("description")} />
              {errors.description && (
                <p role="alert" className="text-xs text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="deadline-counting-mode">Modo de contagem *</Label>
              <select
                id="deadline-counting-mode"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                {...register("countingMode")}
              >
                {countingModes.map((mode_) => (
                  <option key={mode_} value={mode_}>
                    {countingModeLabels[mode_]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="deadline-days">Dias *</Label>
              <Input id="deadline-days" type="number" min={1} step={1} {...register("days")} />
              {errors.days && (
                <p role="alert" className="text-xs text-destructive">
                  {errors.days.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="deadline-start-date">Data de início *</Label>
              <Input id="deadline-start-date" type="date" {...register("startDate")} />
              {errors.startDate && (
                <p role="alert" className="text-xs text-destructive">
                  {errors.startDate.message}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 pt-6">
              <input
                id="deadline-is-fatal"
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                {...register("isFatal")}
              />
              <Label htmlFor="deadline-is-fatal">Prazo fatal</Label>
            </div>

            {formError && (
              <p role="alert" className="text-sm text-destructive sm:col-span-2">
                {formError}
              </p>
            )}

            <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">
                  Cancelar
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : mode === "create" ? "Criar prazo" : "Salvar alterações"}
              </Button>
            </div>
          </form>
        )}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
