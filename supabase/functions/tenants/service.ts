import type { SupabaseClient } from "@supabase/supabase-js";
import type { Pool } from "pg";
import { inviteUserInputSchema, type InviteUserInput } from "@legal-manager/schema";
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
