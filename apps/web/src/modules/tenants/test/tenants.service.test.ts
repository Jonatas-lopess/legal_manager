// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as controller from "../tenants.controller";
import { supabase } from "@/lib/supabase";
import {
  assertStackReachable,
  cleanupAll,
  closeHarness,
  extractVerifyTokenHash,
  seedAdmin,
  seedMember,
  seedTenant,
  waitForMailpitMessage,
} from "./harness";

await assertStackReachable();

afterEach(async () => {
  await controller.logout().catch(() => {});
  await cleanupAll();
});
afterAll(closeHarness);

describe("tenants.service — login/session", () => {
  it("logs in with the right password and exposes tenant_id/role via getCurrentUser()", async () => {
    const tenantId = await seedTenant();
    const admin = await seedAdmin(tenantId);

    await controller.login({ email: admin.email, password: admin.password });
    const user = await controller.getCurrentUser();

    expect(user).toMatchObject({ id: admin.id, tenantId, role: "admin", email: admin.email });
  });

  it("rejects a wrong password", async () => {
    const tenantId = await seedTenant();
    const admin = await seedAdmin(tenantId);

    await expect(controller.login({ email: admin.email, password: "wrong-password" })).rejects.toThrow();
  });

  it("logout clears the session", async () => {
    const tenantId = await seedTenant();
    const admin = await seedAdmin(tenantId);

    await controller.login({ email: admin.email, password: admin.password });
    await controller.logout();

    expect(await controller.getCurrentUser()).toBeNull();
  });

  it("getCurrentUser() is null with no session", async () => {
    expect(await controller.getCurrentUser()).toBeNull();
  });
});

describe("tenants.service — password reset round trip", () => {
  it("requestPasswordReset emails a real recovery link that completePasswordReset can act on", async () => {
    const tenantId = await seedTenant();
    const admin = await seedAdmin(tenantId);

    await controller.requestPasswordReset(admin.email);

    const message = await waitForMailpitMessage(admin.email, "Reset your password");
    const tokenHash = extractVerifyTokenHash(message);

    // Simulates the user clicking the emailed link and landing on
    // /reset-password with a recovery session already established —
    // verifyOtp is the non-browser equivalent of GoTrue's redirect dance.
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });
    expect(verifyError).toBeNull();

    const newPassword = `Nova-${tokenHash.slice(0, 8)}`;
    await controller.completePasswordReset(newPassword);
    await controller.logout();

    await controller.login({ email: admin.email, password: newPassword });
    expect(await controller.getCurrentUser()).toMatchObject({ id: admin.id });
  });
});

describe("tenants.service — member roster", () => {
  it("lists only the caller's own tenant's members, even with a second tenant in the same database", async () => {
    const tenantA = await seedTenant();
    const tenantB = await seedTenant();
    const adminA = await seedAdmin(tenantA);
    const advogadoA = await seedMember(tenantA, "advogado");
    await seedAdmin(tenantB);

    await controller.login({ email: adminA.email, password: adminA.password });
    const members = await controller.listMembers();

    expect(members.map((m) => m.id).sort()).toEqual([adminA.id, advogadoA.id].sort());
  });
});
