// packages/schema is the single source of truth for these shapes — reused
// as-is by the invite Edge Function (see supabase/functions/tenants/service.ts).
export {
  loginInputSchema,
  requestPasswordResetInputSchema,
  updatePasswordInputSchema,
  inviteUserInputSchema,
  invitableRoles,
  userRoles,
} from "@legal-manager/schema";
export type {
  LoginInput,
  RequestPasswordResetInput,
  UpdatePasswordInput,
  InviteUserInput,
  InvitableRole,
  UserRole,
} from "@legal-manager/schema";
