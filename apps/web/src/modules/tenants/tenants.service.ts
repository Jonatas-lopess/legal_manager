import { FunctionsHttpError, type Session } from "@supabase/supabase-js";
import {
  inviteUserInputSchema,
  loginInputSchema,
  removeMemberInputSchema,
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

/**
 * `supabase.functions.invoke`'s rejected promise never carries the Edge
 * Function's own JSON error body in `.message` — `FunctionsHttpError`
 * hardcodes a generic "non-2xx status code" message, the real `{ error }`
 * body only lives on `.context` (a `Response`). The removal guardrails
 * (self-removal / last-admin) are enforced server-side specifically so their
 * messages can be surfaced to the user (ticket 04) — undoing this
 * genericization here is what makes that possible, unlike `inviteUser` above
 * which has always let the generic message through.
 */
async function unwrapFunctionError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string };
      if (body.error) return new Error(body.error);
    } catch {
      // Body wasn't JSON (or already consumed) — fall through to the
      // generic error below rather than throwing a different error here.
    }
  }
  return error instanceof Error ? error : new Error("Não foi possível remover o usuário.");
}

/**
 * Admin-only, tenant-scoped, and guardrailed against self-removal/removing
 * the tenant's last admin — all enforced server-side in the `tenants` Edge
 * Function (see supabase/functions/tenants/service.ts's `removeMember`),
 * never re-implemented here. This is a thin pass-through, same shape as
 * `inviteUser` above, except it also unwraps the Edge Function's real error
 * message (see `unwrapFunctionError`) so the guardrail messages actually
 * reach the caller.
 */
export async function removeMember(userId: string): Promise<{ id: string }> {
  const parsed = removeMemberInputSchema.parse({ userId });
  const { data, error } = await repo.removeMember(parsed);
  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error("Falha ao remover usuário.");
  return data;
}

export function subscribeToAuthChanges(callback: (session: Session | null) => void) {
  return repo.onAuthStateChange(callback);
}
