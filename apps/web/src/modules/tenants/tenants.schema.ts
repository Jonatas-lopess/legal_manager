// packages/schema is the single source of truth for these shapes — reused
// as-is by the invite Edge Function (see supabase/functions/tenants/service.ts).
export {
  loginInputSchema,
  requestPasswordResetInputSchema,
  updatePasswordInputSchema,
  inviteUserInputSchema,
  removeMemberInputSchema,
  invitableRoles,
  userRoles,
} from "@legal-manager/schema";
export type {
  LoginInput,
  RequestPasswordResetInput,
  UpdatePasswordInput,
  InviteUserInput,
  RemoveMemberInput,
  InvitableRole,
  UserRole,
} from "@legal-manager/schema";
