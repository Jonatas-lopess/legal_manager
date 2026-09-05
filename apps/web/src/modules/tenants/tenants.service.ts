import type { Session } from "@supabase/supabase-js";
import {
  inviteUserInputSchema,
  loginInputSchema,
  requestPasswordResetInputSchema,
  updatePasswordInputSchema,
  type InviteUserInput,
  type LoginInput,
  type UserRole,
} from "./tenants.schema";
import * as repo from "./tenants.repository";

export interface CurrentUser {
  id: string;
  tenantId: string;
  role: UserRole;
  name: string | null;
  email: string | null;
}

export interface Member {
  id: string;
  role: UserRole;
  name: string | null;
  email: string | null;
}

export async function login(input: LoginInput): Promise<void> {
  const parsed = loginInputSchema.parse(input);
  const { error } = await repo.signInWithPassword(parsed);
  if (error) throw error;
}

export async function logout(): Promise<void> {
  const { error } = await repo.signOut();
  if (error) throw error;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const parsed = requestPasswordResetInputSchema.parse({ email });
  const { error } = await repo.sendPasswordResetEmail(parsed.email);
  if (error) throw error;
}

export async function completePasswordReset(password: string): Promise<void> {
  const parsed = updatePasswordInputSchema.parse({ password });
  const { error } = await repo.updatePassword(parsed.password);
  if (error) throw error;
}

/**
 * `tenant_id`/`role` sourced via `current_tenant_id()`/`auth.uid()`
 * (ADR-0005) through the caller's own `public.users` row — no parallel
 * tenant-resolution path.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await repo.getSession();
  if (!session) return null;

  const { data, error } = await repo.fetchOwnUserRow(session.user.id);
  if (error || !data) return null;

  return {
    id: data.id,
    tenantId: data.tenant_id,
    role: data.role,
    name: data.name,
    email: data.email,
  };
}

/** RLS scopes this to the caller's own tenant — see tenants.repository.ts. */
export async function listMembers(): Promise<Member[]> {
  const { data, error } = await repo.fetchTenantMembers();
  if (error) throw error;
  return data ?? [];
}

export async function inviteUser(input: InviteUserInput) {
  const parsed = inviteUserInputSchema.parse(input);
  const { data, error } = await repo.inviteUser(parsed);
  if (error) throw error;
  return data;
}

export function subscribeToAuthChanges(callback: (session: Session | null) => void) {
  return repo.onAuthStateChange(callback);
}
