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

// Mirrors `packages/db/src/schema.ts`'s `matterStatusEnum`.
export const matterStatuses = ["rascunho", "em_andamento", "concluido", "arquivado"] as const;
export type MatterStatus = (typeof matterStatuses)[number];

// Same blank/absent-collapses-to-null treatment as `optionalText()`, but for
// a nullable FK column — "" (a cleared `<select>`) and "not provided" both
// mean "no reference chosen" here (ADR-0004: rascunho allows both null).
const optionalUuid = () =>
  optionalText().refine(
    (value) => value === null || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
    "ID inválido",
  );

export const createMatterInputSchema = z.object({
  clientId: optionalUuid(),
  matterCatalogItemId: optionalUuid(),
  status: z.enum(matterStatuses).default("rascunho"),
  // Mirrors `matters_uf_is_two_letters` (packages/db/src/schema.ts) — the DB
  // check remains the source of truth, this is a UX pre-check (ADR-0002).
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "UF deve ter exatamente 2 letras"),
  comarca: optionalText(),
  municipio: optionalText(),
  description: optionalText(),
});
export type CreateMatterInput = z.input<typeof createMatterInputSchema>;

// NOT a plain `.partial()` for `status`, unlike the other fields: in zod v4,
// wrapping a `.default()`-bearing field in `.optional()` (what `.partial()`
// does under the hood) does *not* stop the default from firing on a
// genuinely-omitted key — `updateMatterInputSchema.parse({})` would still
// yield `status: "rascunho"`, silently reverting an in-progress matter's
// status on any edit that doesn't touch it. (The `createClientInputSchema`
// comment nearby claims `.partial()` drops `.default()` — that held in zod
// v3, not in this v4 install; `clients`'s `status` field has this same latent
// issue, out of scope for this module to fix.) `.extend()` after `.partial()`
// replaces `status` with a default-free optional enum, so an omitted key
// stays `undefined` and the caller's/row's existing status is preserved.
export const updateMatterInputSchema = createMatterInputSchema.partial().extend({
  status: z.enum(matterStatuses).optional(),
});
export type UpdateMatterInput = z.input<typeof updateMatterInputSchema>;

// Mirrors `packages/db/src/schema.ts`'s `tags.color` column (DB default
// `"#6366f1"`). Deliberately no `.default()` on either field here — neither
// needs one (unlike `matters`' `status`), so `.partial()` below is safe per
// the zod v4 `.partial()`-doesn't-strip-`.default()` bug ticket 03 found;
// `tags.repository.ts` omits `color` from the insert payload when absent so
// the DB default applies, rather than duplicating it in the schema.
const hexColorRegex = /^#[0-9a-f]{6}$/i;

export const createTagInputSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório"),
  color: z
    .string()
    .trim()
    .regex(hexColorRegex, "Cor deve ser um hexadecimal válido, ex: #6366f1")
    .optional(),
});
export type CreateTagInput = z.input<typeof createTagInputSchema>;

export const updateTagInputSchema = createTagInputSchema.partial();
export type UpdateTagInput = z.input<typeof updateTagInputSchema>;
