import { z } from "zod";
import { cpf, cnpj } from "cpf-cnpj-validator";

// Mirrors `packages/db/src/schema.ts`'s `userRoleEnum` — kept in sync by hand
// since drizzle-kit doesn't emit a Zod schema for it.
export const userRoles = ["admin", "advogado", "secretario"] as const;
export type UserRole = (typeof userRoles)[number];

// Only `admin` provisions accounts (PLANNING §8 role matrix); an admin
// can't invite another admin in the MVP, so the invite input is narrower
// than the full role set.
export const invitableRoles = ["advogado", "secretario"] as const;
export type InvitableRole = (typeof invitableRoles)[number];

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const requestPasswordResetInputSchema = z.object({
  email: z.string().email(),
});
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetInputSchema>;

export const updatePasswordInputSchema = z.object({
  password: z.string().min(6),
});
export type UpdatePasswordInput = z.infer<typeof updatePasswordInputSchema>;

export const inviteUserInputSchema = z.object({
  email: z.string().email(),
  role: z.enum(invitableRoles),
});
export type InviteUserInput = z.infer<typeof inviteUserInputSchema>;

// Mirrors `packages/db/src/schema.ts`'s `clientStatusEnum`.
export const clientStatuses = ["ativo", "inativo"] as const;
export type ClientStatus = (typeof clientStatuses)[number];

// Blank input ("" from a cleared form field) and "not provided" both mean
// "no value" here — collapsed to `null` so callers never have to juggle
// `undefined` vs. `null` vs. `""` against a nullable DB column.
const optionalText = () =>
  z
    .string()
    .trim()
    .nullish()
    .transform((value) => (value ? value : null));

export const createClientInputSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório"),
  status: z.enum(clientStatuses).default("ativo"),
  cpf: optionalText().refine((value) => value === null || cpf.isValid(value), "CPF inválido"),
  cnpj: optionalText().refine((value) => value === null || cnpj.isValid(value), "CNPJ inválido"),
  rg: optionalText(),
  birthDate: optionalText(),
  phone: optionalText(),
  email: z
    .string()
    .trim()
    .email("E-mail inválido")
    .nullish()
    .transform((value) => (value ? value : null)),
  address: optionalText(),
  maritalStatus: optionalText(),
  profession: optionalText(),
  opposingParty: optionalText(),
  powerOfAttorney: optionalText(),
  observations: optionalText(),
});
// The *input* type, not `z.infer`/`z.output` — every field's `.transform()`
// makes its output `string | null` (never `undefined`), which would force
// callers to pass every key. Callers (service/controller/UI) work with this
// permissive shape; `clients.repository.ts` types on `z.output<>` instead,
// since it only ever sees an already-`.parse()`d value.
export type CreateClientInput = z.input<typeof createClientInputSchema>;

// Every field independently optional for a partial edit — `status` keeps its
// own value rather than resetting to "ativo" when omitted (unlike create's
// default), since `.partial()` drops the base schema's `.default()` too.
export const updateClientInputSchema = createClientInputSchema.partial();
export type UpdateClientInput = z.input<typeof updateClientInputSchema>;

export const createCatalogItemInputSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório"),
});
export type CreateCatalogItemInput = z.input<typeof createCatalogItemInputSchema>;

export const updateCatalogItemInputSchema = createCatalogItemInputSchema.partial();
export type UpdateCatalogItemInput = z.input<typeof updateCatalogItemInputSchema>;
