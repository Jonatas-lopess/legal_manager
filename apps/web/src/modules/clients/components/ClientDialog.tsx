import * as React from "react";
import { Dialog } from "radix-ui";
import { Controller, useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { maskCNPJ, maskCPF, maskPhone } from "@/lib/masks";
import { createClient, updateClient, type Client } from "../clients.controller";
import { createClientInputSchema } from "../clients.schema";

type FormInput = z.input<typeof createClientInputSchema>;
type FormOutput = z.output<typeof createClientInputSchema>;

function toFormValues(client: Client | null): FormInput {
  return {
    name: client?.name ?? "",
    status: client?.status ?? "ativo",
    cpf: client?.cpf ?? "",
    cnpj: client?.cnpj ?? "",
    rg: client?.rg ?? "",
    birthDate: client?.birthDate ?? "",
    phone: client?.phone ?? "",
    email: client?.email ?? "",
    address: client?.address ?? "",
    maritalStatus: client?.maritalStatus ?? "",
    profession: client?.profession ?? "",
    opposingParty: client?.opposingParty ?? "",
    powerOfAttorney: client?.powerOfAttorney ?? "",
    observations: client?.observations ?? "",
  };
}

interface ClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  client: Client | null;
  onSaved: () => void;
}

export function ClientDialog({ open, onOpenChange, mode, client, onSaved }: ClientDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {open && <ClientDialogContent mode={mode} client={client} onSaved={onSaved} onOpenChange={onOpenChange} />}
    </Dialog.Root>
  );
}

function ClientDialogContent({
  mode,
  client,
  onSaved,
  onOpenChange,
}: {
  mode: "create" | "edit";
  client: Client | null;
  onSaved: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [formError, setFormError] = React.useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createClientInputSchema),
    defaultValues: toFormValues(client),
  });

  const onSubmit: SubmitHandler<FormOutput> = async (data) => {
    setFormError(null);
    try {
      if (mode === "create") {
        await createClient(data);
      } else if (client) {
        await updateClient(client.id, data);
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não foi possível salvar o cliente.");
    }
  };

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/50" />
      <Dialog.Content className="fixed top-1/2 left-1/2 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-card p-6 text-card-foreground shadow">
        <Dialog.Title className="font-semibold leading-none tracking-tight">
          {mode === "create" ? "Novo cliente" : "Editar cliente"}
        </Dialog.Title>
        <Dialog.Description className="mt-1.5 text-sm text-muted-foreground">
          {mode === "create" ? "Cadastre um cliente do seu escritório." : "Atualize os dados do cliente."}
        </Dialog.Description>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="client-name">Nome *</Label>
            <Input id="client-name" {...register("name")} />
            {errors.name && (
              <p role="alert" className="text-xs text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          {mode === "edit" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="client-status">Status</Label>
              <select
                id="client-status"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                {...register("status")}
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="client-cpf">CPF</Label>
            <Controller
              control={control}
              name="cpf"
              render={({ field }) => (
                <Input
                  id="client-cpf"
                  inputMode="numeric"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(maskCPF(e.target.value))}
                  onBlur={field.onBlur}
                />
              )}
            />
            {errors.cpf && (
              <p role="alert" className="text-xs text-destructive">
                {errors.cpf.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="client-cnpj">CNPJ</Label>
            <Controller
              control={control}
              name="cnpj"
              render={({ field }) => (
                <Input
                  id="client-cnpj"
                  inputMode="numeric"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(maskCNPJ(e.target.value))}
                  onBlur={field.onBlur}
                />
              )}
            />
            {errors.cnpj && (
              <p role="alert" className="text-xs text-destructive">
                {errors.cnpj.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="client-rg">RG</Label>
            <Input id="client-rg" {...register("rg")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="client-birth-date">Data de nascimento</Label>
            <Input id="client-birth-date" type="date" {...register("birthDate")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="client-phone">Telefone</Label>
            <Controller
              control={control}
              name="phone"
              render={({ field }) => (
                <Input
                  id="client-phone"
                  inputMode="numeric"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(maskPhone(e.target.value))}
                  onBlur={field.onBlur}
                />
              )}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="client-email">E-mail</Label>
            <Input id="client-email" type="email" {...register("email")} />
            {errors.email && (
              <p role="alert" className="text-xs text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="client-address">Endereço</Label>
            <Input id="client-address" {...register("address")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="client-marital-status">Estado civil</Label>
            <Input id="client-marital-status" {...register("maritalStatus")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="client-profession">Profissão</Label>
            <Input id="client-profession" {...register("profession")} />
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="client-opposing-party">Parte contrária</Label>
            <Input id="client-opposing-party" {...register("opposingParty")} />
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="client-power-of-attorney">Dados de procuração</Label>
            <Input id="client-power-of-attorney" {...register("powerOfAttorney")} />
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="client-observations">Observações</Label>
            <Input id="client-observations" {...register("observations")} />
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
              {isSubmitting ? "Salvando..." : mode === "create" ? "Criar cliente" : "Salvar alterações"}
            </Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
