import type { SupabaseClient } from "@supabase/supabase-js";
import type { Pool } from "pg";
import { inviteUserInputSchema, removeMemberInputSchema, type InviteUserInput } from "@legal-manager/schema";
import * as repo from "./repository.ts";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface InviteDeps {
  /** Anon-keyed client, used only to verify the caller's JWT against GoTrue. */
  authClient: SupabaseClient;
  /** Service-role Auth Admin API — the one thing this function needs the secret for. */
  authAdmin: SupabaseClient["auth"]["admin"];
  /** Direct Postgres connection — see repository.ts for why PostgREST isn't used here. */
  db: Pool;
}

export interface InvitedMember {
  id: string;
  tenantId: string;
  role: InviteUserInput["role"];
  email: string;
}

/**
 * Verifies the caller, rejects non-admins, then invites the user and
 * provisions their `public.users` row in one request — `tenant_id` is
 * always the caller's own (derived server-side, never from `rawInput`), and
 * a failed row insert deletes the just-created Auth user rather than
 * leaving an Auth-account-without-a-tenant-row orphan.
 */
export async function inviteUser(
  deps: InviteDeps,
  jwt: string | null,
  rawInput: unknown,
): Promise<InvitedMember> {
  if (!jwt) throw new HttpError(401, "Missing bearer token");

  const callerAuthUser = await repo.verifyJwt(deps.authClient, jwt);
  if (!callerAuthUser) throw new HttpError(401, "Invalid or expired token");

  const caller = await repo.fetchCallerMembership(deps.db, callerAuthUser.id);
  if (!caller) throw new HttpError(401, "Caller has no tenant membership");
  if (caller.role !== "admin") throw new HttpError(403, "Only admins can invite users");

  const input = inviteUserInputSchema.parse(rawInput);

  const { data: invited, error: inviteError } = await repo.inviteUserByEmail(
    deps.authAdmin,
    input.email,
  );
  if (inviteError || !invited.user) {
    throw new HttpError(400, inviteError?.message ?? "Failed to invite user");
  }

  try {
    await repo.insertTenantMember(deps.db, {
      id: invited.user.id,
      tenantId: caller.tenantId,
      role: input.role,
      email: input.email,
    });
  } catch (error) {
    await repo.deleteAuthUser(deps.authAdmin, invited.user.id);
    throw error;
  }

  return { id: invited.user.id, tenantId: caller.tenantId, role: input.role, email: input.email };
}

export interface RemovedMember {
  id: string;
}

/**
 * Verifies the caller, rejects non-admins, then removes a tenant member: the
 * `public.users` row first, then their Supabase Auth account (same
 * `deleteAuthUser` helper `inviteUser` above uses for its own cleanup path,
 * reused here as the primary delete rather than a failure-cleanup one — see
 * that helper's `.catch(() => {})`: a failure to delete the Auth account is
 * swallowed rather than surfaced, so the caller still sees success once the
 * `users` row (the row RLS/`current_tenant_id()` actually keys off) is gone;
 * a leftover Auth account with no tenant row is the same harmless orphan
 * shape `inviteUser`'s own failure path already accepts, just reached from
 * the other direction).
 *
 * Two guardrails, deliberately checked in this order (see ticket 04's
 * Comments for the full reasoning): the **last-admin** check runs first
 * because it's the more specific/informative reason whenever it applies,
 * and it only ever applies to a sole admin removing themselves (the
 * admin-only gate above forces the caller to be an admin of the same
 * tenant, so if the target is that tenant's only admin, caller and target
 * are necessarily the same person). Checking last-admin first means that
 * exact scenario reports "you're the last admin", not the more generic
 * "you can't remove yourself" — while the **self-removal** check below still
 * independently blocks an admin from removing their own row even when other
 * admins exist (a case the last-admin count alone would never catch).
 */
export async function removeMember(
  deps: InviteDeps,
  jwt: string | null,
  rawInput: unknown,
): Promise<RemovedMember> {
  if (!jwt) throw new HttpError(401, "Missing bearer token");

  const callerAuthUser = await repo.verifyJwt(deps.authClient, jwt);
  if (!callerAuthUser) throw new HttpError(401, "Invalid or expired token");

  const caller = await repo.fetchCallerMembership(deps.db, callerAuthUser.id);
  if (!caller) throw new HttpError(401, "Caller has no tenant membership");
  if (caller.role !== "admin") throw new HttpError(403, "Only admins can remove members");

  const { userId } = removeMemberInputSchema.parse(rawInput);

  // Direct-Postgres lookup (bypasses RLS, see fetchMemberById) — a bogus id
  // or a different tenant's user both read as "not found" here, never a
  // distinguishable error that would leak cross-tenant existence.
  const target = await repo.fetchMemberById(deps.db, userId);
  if (!target || target.tenantId !== caller.tenantId) {
    throw new HttpError(404, "Usuário não encontrado nesta organização.");
  }

  if (target.role === "admin") {
    // Fast-path pre-check, kept only so a sole-admin self-removal still
    // gets this specific message ahead of the plain self-removal one below
    // (see this function's own doc comment on that ordering). Not itself
    // load-bearing for correctness under concurrency — two racing
    // removeMember calls could both read a passing count here — that's
    // deleteTenantMember's job (repository.ts): it re-checks inside a
    // transaction that locks the tenant's admin rows first, so whichever
    // request commits second is the one that actually gets rejected.
    const adminCount = await repo.countAdminsInTenant(deps.db, caller.tenantId);
    if (adminCount <= 1) {
      throw new HttpError(400, "Não é possível remover o último administrador do escritório.");
    }
  }

  if (userId === callerAuthUser.id) {
    throw new HttpError(400, "Você não pode remover a si mesmo.");
  }

  try {
    await repo.deleteTenantMember(deps.db, userId, caller.tenantId);
  } catch (error) {
    if (error instanceof repo.LastAdminError) {
      throw new HttpError(400, error.message);
    }
    throw error;
  }
  await repo.deleteAuthUser(deps.authAdmin, userId);

  return { id: userId };
}
