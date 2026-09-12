import { afterAll, afterEach, describe, expect, it } from "vitest";
import { HttpError, inviteUser, removeMember } from "../service.ts";
import {
  authAdmin,
  authClient,
  cleanupAll,
  closeHarness,
  countUsersInTenant,
  db,
  seedMember,
  seedTenantWithAdmin,
  signIn,
} from "./harness.ts";

const deps = { authClient, authAdmin, db };

afterEach(cleanupAll);
afterAll(closeHarness);

describe("invite Edge Function service", () => {
  it("admin caller: invites the user and provisions their users row in the caller's tenant", async () => {
    const tenant = await seedTenantWithAdmin();
    const jwt = await signIn(tenant.adminEmail, tenant.adminPassword);
    const email = `invitee-${tenant.tenantId}@test.local`;

    const result = await inviteUser(deps, jwt, { email, role: "advogado" });

    expect(result.tenantId).toBe(tenant.tenantId);
    expect(result.role).toBe("advogado");

    const { rows } = await db.query<{ tenant_id: string; role: string }>(
      "select tenant_id, role from users where id = $1",
      [result.id],
    );
    expect(rows[0]).toEqual({ tenant_id: tenant.tenantId, role: "advogado" });
  });

  it("ignores any client-supplied tenant_id — always uses the caller's own", async () => {
    const tenant = await seedTenantWithAdmin();
    const otherTenant = await seedTenantWithAdmin();
    const jwt = await signIn(tenant.adminEmail, tenant.adminPassword);
    const email = `invitee-${tenant.tenantId}@test.local`;

    const result = await inviteUser(deps, jwt, {
      email,
      role: "advogado",
      tenant_id: otherTenant.tenantId,
    });

    expect(result.tenantId).toBe(tenant.tenantId);
  });

  it("rejects a non-admin caller and creates no rows", async () => {
    const tenant = await seedTenantWithAdmin();
    const advogado = await seedMember(tenant.tenantId, "advogado");
    const jwt = await signIn(advogado.email, advogado.password);
    const before = await countUsersInTenant(tenant.tenantId);

    await expect(
      inviteUser(deps, jwt, { email: "nope@test.local", role: "secretario" }),
    ).rejects.toMatchObject({ status: 403 } satisfies Partial<HttpError>);

    expect(await countUsersInTenant(tenant.tenantId)).toBe(before);
  });

  it("rejects a missing bearer token", async () => {
    await expect(inviteUser(deps, null, { email: "x@test.local", role: "advogado" })).rejects.toMatchObject(
      { status: 401 } satisfies Partial<HttpError>,
    );
  });

  it("rejects an invalid/expired token", async () => {
    await expect(
      inviteUser(deps, "not-a-real-jwt", { email: "x@test.local", role: "advogado" }),
    ).rejects.toMatchObject({ status: 401 } satisfies Partial<HttpError>);
  });
});

async function userRowExists(userId: string): Promise<boolean> {
  const { rows } = await db.query("select 1 from users where id = $1", [userId]);
  return rows.length > 0;
}

async function authUserExists(userId: string): Promise<boolean> {
  const { data, error } = await authAdmin.getUserById(userId);
  return !error && !!data.user;
}

describe("removeMember Edge Function service", () => {
  it("admin caller: removes a member — deletes both the users row and the Auth user", async () => {
    const tenant = await seedTenantWithAdmin();
    const target = await seedMember(tenant.tenantId, "advogado");
    const jwt = await signIn(tenant.adminEmail, tenant.adminPassword);

    const result = await removeMember(deps, jwt, { userId: target.id });

    expect(result).toEqual({ id: target.id });
    expect(await userRowExists(target.id)).toBe(false);
    expect(await authUserExists(target.id)).toBe(false);
  });

  it("rejects a non-admin caller and removes nothing", async () => {
    const tenant = await seedTenantWithAdmin();
    const advogado = await seedMember(tenant.tenantId, "advogado");
    const target = await seedMember(tenant.tenantId, "secretario");
    const jwt = await signIn(advogado.email, advogado.password);
    const before = await countUsersInTenant(tenant.tenantId);

    await expect(removeMember(deps, jwt, { userId: target.id })).rejects.toMatchObject({
      status: 403,
    } satisfies Partial<HttpError>);

    expect(await countUsersInTenant(tenant.tenantId)).toBe(before);
    expect(await userRowExists(target.id)).toBe(true);
  });

  it("rejects self-removal, even when another admin exists in the tenant", async () => {
    const tenant = await seedTenantWithAdmin();
    const secondAdmin = await seedMember(tenant.tenantId, "admin");
    const jwt = await signIn(tenant.adminEmail, tenant.adminPassword);

    await expect(removeMember(deps, jwt, { userId: tenant.adminId })).rejects.toMatchObject({
      status: 400,
      message: "Você não pode remover a si mesmo.",
    } satisfies Partial<HttpError>);

    expect(await userRowExists(tenant.adminId)).toBe(true);
    expect(await userRowExists(secondAdmin.id)).toBe(true);
  });

  it("rejects removing the tenant's last admin", async () => {
    const tenant = await seedTenantWithAdmin();
    const jwt = await signIn(tenant.adminEmail, tenant.adminPassword);

    // The only admin in this tenant removing themselves hits the
    // last-admin guardrail first (see service.ts's removeMember comment for
    // why it's checked before self-removal) — a distinct, more specific
    // message than the plain self-removal case above.
    await expect(removeMember(deps, jwt, { userId: tenant.adminId })).rejects.toMatchObject({
      status: 400,
      message: "Não é possível remover o último administrador do escritório.",
    } satisfies Partial<HttpError>);

    expect(await userRowExists(tenant.adminId)).toBe(true);
  });

  it("closes the race between two concurrent removals of a tenant's last two admins", async () => {
    const tenant = await seedTenantWithAdmin();
    const secondAdmin = await seedMember(tenant.tenantId, "admin");
    const jwt1 = await signIn(tenant.adminEmail, tenant.adminPassword);
    const jwt2 = await signIn(secondAdmin.email, secondAdmin.password);

    // Both admins try to remove each other at the same time. Each request's
    // own countAdminsInTenant pre-check (service.ts) can read 2 before
    // either delete commits — that pre-check alone can't close this race.
    // trg_prevent_last_admin_removal (see migrations) is what actually
    // serializes the two deletes and rejects whichever commits second.
    const results = await Promise.allSettled([
      removeMember(deps, jwt1, { userId: secondAdmin.id }),
      removeMember(deps, jwt2, { userId: tenant.adminId }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      status: 400,
      message: "Não é possível remover o último administrador do escritório.",
    } satisfies Partial<HttpError>);

    // Exactly one admin was actually removed — never both.
    expect(await countUsersInTenant(tenant.tenantId)).toBe(1);
  });

  it("is tenant-scoped: rejects removing a user from a different tenant", async () => {
    const tenantA = await seedTenantWithAdmin();
    const tenantB = await seedTenantWithAdmin();
    const jwt = await signIn(tenantA.adminEmail, tenantA.adminPassword);

    await expect(removeMember(deps, jwt, { userId: tenantB.adminId })).rejects.toMatchObject({
      status: 404,
    } satisfies Partial<HttpError>);

    expect(await userRowExists(tenantB.adminId)).toBe(true);
  });

  it("rejects a missing bearer token", async () => {
    await expect(removeMember(deps, null, { userId: "00000000-0000-0000-0000-000000000000" })).rejects.toMatchObject(
      { status: 401 } satisfies Partial<HttpError>,
    );
  });

  it("rejects an invalid/expired token", async () => {
    await expect(
      removeMember(deps, "not-a-real-jwt", { userId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toMatchObject({ status: 401 } satisfies Partial<HttpError>);
  });
});
