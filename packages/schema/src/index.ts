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

// New in ui-shell-clientes-casos-config/04 — Equipe's "Excluir" action.
// Just the target's id: the caller (and their tenant/role) is always derived
// server-side from the JWT, same as inviteUserInputSchema never carries a
// tenant_id either. Reused by both the frontend `tenants` module and the
// `tenants` Edge Function's `removeMember` action (see that Edge Function's
// service.ts).
export const removeMemberInputSchema = z.object({
  userId: z.string().uuid("ID de usuário inválido"),
});
export type RemoveMemberInput = z.infer<typeof removeMemberInputSchema>;

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

// Mirrors `packages/db/src/schema.ts`'s `paymentStatusEnum`.
export const paymentStatuses = ["pago", "pendente"] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

// Same uuid-shape check as `optionalUuid()` above, but non-nullable — unlike
// a matter's `clientId`/`matterCatalogItemId`, a payment always belongs to a
// specific matter (no rascunho-style "not chosen yet" state). RLS + the
// composite FK (packages/db/src/schema.ts) reject a matter from another
// tenant; this only rejects a value that isn't even uuid-shaped.
const matterIdRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// No `.partial()` derivative here on purpose — payments has no general
// field-patch (PLANNING §4: "sem split"), only a status toggle that reads
// the row's current status itself (payments.service.ts) rather than taking
// a target status as input, so the zod v4 `.partial()`-doesn't-strip-
// `.default()` bug ticket 03 flagged for `matters`/`clients` doesn't apply:
// there's no partial schema to trip on it.
export const createPaymentInputSchema = z.object({
  matterId: z.string().trim().regex(matterIdRegex, "ID de processo inválido"),
  value: z.coerce.number().positive("Valor deve ser maior que zero"),
  status: z.enum(paymentStatuses).default("pendente"),
});
export type CreatePaymentInput = z.input<typeof createPaymentInputSchema>;

// Mirrors `packages/db/src/schema.ts`'s `countingModeEnum`/`deadlineStatusEnum`
// (deadlines-engine-alerts/01) — no Zod shape existed for either yet
// (checked: `deadlines.matterId`/`isFatal`/`countingMode` were DB-only until
// now), so both are defined here for the first time.
export const countingModes = ["dias_uteis", "dias_corridos"] as const;
export type CountingMode = (typeof countingModes)[number];

export const deadlineStatuses = ["pendente", "cumprido"] as const;
export type DeadlineStatus = (typeof deadlineStatuses)[number];

// Same non-nullable uuid-shape check as `createPaymentInputSchema`'s
// `matterIdRegex` above — a deadline, like a payment, always belongs to a
// specific matter (no rascunho-style "not chosen yet" state). Not reusing
// that same-named const across sections (kept local, mirroring how each
// section here is self-contained).
const deadlineMatterIdRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const createDeadlineInputSchema = z.object({
  matterId: z.string().trim().regex(deadlineMatterIdRegex, "ID de processo inválido"),
  countingMode: z.enum(countingModes),
  days: z.coerce.number().int().positive("Dias deve ser um número inteiro positivo"),
  isFatal: z.boolean().default(false),
  // Calendar date, not an instant — same convention as `clients.birthDate`
  // (`optionalText()` above). No full date-format regex: a trimmed
  // non-empty string is enough here, the DB `date` column and
  // `computeDueDate`'s own `YYYY-MM-DD` parsing are the real guards.
  startDate: z.string().trim().min(1, "Data de início é obrigatória"),
  description: z.string().trim().min(1, "Descrição é obrigatória"),
});
export type CreateDeadlineInput = z.input<typeof createDeadlineInputSchema>;

// No `status` field at all — status changes through a separate "mark
// cumprido" action, same precedent as `createPaymentInputSchema`'s "no
// general field-patch" note: `deadlines.service.ts`'s `markDeadlineCumprido`
// reads the row's current status itself rather than taking a target status
// as input, so there's no defaulted `status` field left to trip the zod v4
// `.partial()`-doesn't-strip-`.default()` bug (see `updateMatterInputSchema`'s
// comment above for the full explanation).
//
// `isFatal` still carries `.default(false)` above, though — a bare
// `.partial()` alone would leave that same bug in place for it (an edit
// that omits `isFatal` would otherwise silently reset it to `false`). Same
// `.extend()`-after-`.partial()` fix `updateMatterInputSchema` uses for
// `status`.
export const updateDeadlineInputSchema = createDeadlineInputSchema.partial().extend({
  isFatal: z.boolean().optional(),
});
export type UpdateDeadlineInput = z.input<typeof updateDeadlineInputSchema>;
