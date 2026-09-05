import { afterAll, afterEach, describe, expect, it } from "vitest";
import { HttpError, inviteUser } from "../service.ts";
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
