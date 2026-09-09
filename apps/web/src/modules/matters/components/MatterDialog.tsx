import * as React from "react";
import { Dialog } from "radix-ui";
import { Controller, useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMatter, updateMatter, matterStatuses, type Matter } from "../matters.controller";
import { createMatterInputSchema } from "../matters.schema";
import { listClients, type Client } from "../../clients/clients.controller";
import { listCatalogItems, type CatalogItem } from "../../catalog/catalog.controller";

type FormInput = z.input<typeof createMatterInputSchema>;
type FormOutput = z.output<typeof createMatterInputSchema>;

const statusLabels: Record<(typeof matterStatuses)[number], string> = {
  rascunho: "Rascunho",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  arquivado: "Arquivado",
};

function toFormValues(matter: Matter | null): FormInput {
  return {
    clientId: matter?.clientId ?? "",
    matterCatalogItemId: matter?.matterCatalogItemId ?? "",
    status: matter?.status ?? "rascunho",
    uf: matter?.uf ?? "",
    comarca: matter?.comarca ?? "",
    municipio: matter?.municipio ?? "",
    description: matter?.description ?? "",
  };
}

interface MatterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  matter: Matter | null;
  onSaved: (matter: Matter) => void;
}

export function MatterDialog({ open, onOpenChange, mode, matter, onSaved }: MatterDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {open && <MatterDialogContent mode={mode} matter={matter} onSaved={onSaved} onOpenChange={onOpenChange} />}
    </Dialog.Root>
  );
}

function MatterDialogContent({
  mode,
  matter,
  onSaved,
  onOpenChange,
}: {
  mode: "create" | "edit";
  matter: Matter | null;
  onSaved: (matter: Matter) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [formError, setFormError] = React.useState<string | null>(null);
  // Client/catalog-item pickers — fetched once per dialog open via the
  // clients/catalog controllers (cross-module, controller-only per PLANNING
  // §6), never their repository/service.
  const [clients, setClients] = React.useState<Client[]>([]);
  const [catalogItems, setCatalogItems] = React.useState<CatalogItem[]>([]);

  React.useEffect(() => {
    listClients().then(setClients).catch(() => {});
    listCatalogItems().then(setCatalogItems).catch(() => {});
  }, []);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createMatterInputSchema),
    defaultValues: toFormValues(matter),
  });

  const onSubmit: SubmitHandler<FormOutput> = async (data) => {
    setFormError(null);
    try {
      const saved = mode === "create" ? await createMatter(data) : matter ? await updateMatter(matter.id, data) : null;
      if (!saved) return;
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não foi possível salvar o processo.");
    }
  };

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/50" />
      <Dialog.Content className="fixed top-1/2 left-1/2 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-card p-6 text-card-foreground shadow">
        <Dialog.Title className="font-semibold leading-none tracking-tight">
          {mode === "create" ? "Novo processo" : "Editar processo"}
        </Dialog.Title>
        <Dialog.Description className="mt-1.5 text-sm text-muted-foreground">
          {mode === "create"
            ? "Um processo pode começar em rascunho, sem cliente ou item do catálogo."
            : "Atualize os dados do processo."}
        </Dialog.Description>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="matter-client">Cliente</Label>
            <select
              id="matter-client"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              {...register("clientId")}
            >
              <option value="">Nenhum (rascunho)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.clientId && (
              <p role="alert" className="text-xs text-destructive">
                {errors.clientId.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="matter-catalog-item">Item do catálogo</Label>
            <select
              id="matter-catalog-item"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              {...register("matterCatalogItemId")}
            >
              <option value="">Nenhum (rascunho)</option>
              {catalogItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            {errors.matterCatalogItemId && (
              <p role="alert" className="text-xs text-destructive">
                {errors.matterCatalogItemId.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="matter-status">Status</Label>
            <select
              id="matter-status"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              {...register("status")}
            >
              {matterStatuses.map((s) => (
                <option key={s} value={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="matter-uf">UF *</Label>
            <Controller
              control={control}
              name="uf"
              render={({ field }) => (
                <Input
                  id="matter-uf"
                  maxLength={2}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value.toUpperCase().slice(0, 2))}
                  onBlur={field.onBlur}
                />
              )}
            />
            {errors.uf && (
              <p role="alert" className="text-xs text-destructive">
                {errors.uf.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="matter-comarca">Comarca</Label>
            <Input id="matter-comarca" {...register("comarca")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="matter-municipio">Município</Label>
            <Input id="matter-municipio" {...register("municipio")} />
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="matter-description">Descrição</Label>
            <Input id="matter-description" {...register("description")} />
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
              {isSubmitting ? "Salvando..." : mode === "create" ? "Criar processo" : "Salvar alterações"}
            </Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
