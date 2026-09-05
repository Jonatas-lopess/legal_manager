// Public API of the `tenants` module (PLANNING §6) — the rest of the app
// (and every other module) reaches auth/tenant-roster logic only through
// this file, never tenants.service.ts/tenants.repository.ts directly
// (enforced by eslint-plugin-boundaries, see eslint.config.ts).
export {
  login,
  logout,
  requestPasswordReset,
  completePasswordReset,
  getCurrentUser,
  listMembers,
  inviteUser,
  subscribeToAuthChanges,
  type CurrentUser,
  type Member,
} from "./tenants.service";
export type { InviteUserInput, InvitableRole, LoginInput, UserRole } from "./tenants.schema";
export { invitableRoles } from "./tenants.schema";
