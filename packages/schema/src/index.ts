import { z } from "zod";

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
