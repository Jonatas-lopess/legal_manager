// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as controller from "../deadlines.controller";
import * as matters from "../../matters/matters.controller";
import * as tags from "../../tags/tags.controller";
import * as tenants from "../../tenants/tenants.controller";
import { assertStackReachable, cleanupAll, closeHarness, seedAdmin, seedMember, seedTenant } from "../../tenants/test/harness";

await assertStackReachable();

afterEach(async () => {
  await tenants.logout().catch(() => {});
  await cleanupAll();
});
afterAll(closeHarness);

async function loginAsNewAdmin() {
  const tenantId = await seedTenant();
  const admin = await seedAdmin(tenantId);
  await tenants.login({ email: admin.email, password: admin.password });
  return { tenantId, admin };
}

/** A real matter, created through the real (already-complete) matters
 * controller — never its service/repository directly, per PLANNING §6's
 * cross-context rule. Rascunho is fine: a deadline only needs a matter id
 * and its `uf`, not a fully-promoted matter. */
async function seedMatter() {
  return matters.createMatter({ uf: "SP" });
}

// Fixture dates picked in a distinctive future year (2031, no weekday
// collision with "today"), mirroring deadlines.repository.test.ts's own
// convention — and relying on the same assumption that test's fixtures
// already lean on: civil_holidays/forensic_holidays start empty in this
// local stack (nothing seeds or syncs them outside deadlines-holiday-sync,
// which this test suite never triggers). `dias_uteis` due dates below are
// pinned assuming weekend-only skipping, no holiday rows in range.

describe("deadlines.controller — CRUD + tenant isolation", () => {
  it("creates a dias_corridos deadline with the correct computed due_date; listing/reading scoped to the caller's tenant", async () => {
    await loginAsNewAdmin();
    const matter = await seedMatter();

    const created = await controller.createDeadline({
      matterId: matter.id,
      countingMode: "dias_corridos",
      days: 10,
      startDate: "2031-03-01",
      description: "Contestação",
    });
    expect(created).toMatchObject({ dueDate: "2031-03-11", status: "pendente", matterId: matter.id });

    const listed = await controller.listDeadlines();
    expect(listed.map((d) => d.id)).toContain(created.id);
    expect(await controller.getDeadline(created.id)).toMatchObject({ id: created.id });

    // Cross-tenant: a second tenant's admin sees nothing of the first
    // tenant's deadline, by list or by direct id (story 23).
    await tenants.logout();
    await loginAsNewAdmin();
    expect((await controller.listDeadlines()).map((d) => d.id)).not.toContain(created.id);
    expect(await controller.getDeadline(created.id)).toBeNull();
  });

  it("recomputes due_date on an edit that changes start_date (dias_corridos, easy arithmetic)", async () => {
    await loginAsNewAdmin();
    const matter = await seedMatter();

    const created = await controller.createDeadline({
      matterId: matter.id,
      countingMode: "dias_corridos",
      days: 10,
      startDate: "2031-03-01",
      description: "Contestação",
    });
    expect(created.dueDate).toBe("2031-03-11");

    const edited = await controller.updateDeadline(created.id, { startDate: "2031-04-01" });
    expect(edited.dueDate).toBe("2031-04-11");
  });

  it("recomputes due_date on an edit that changes counting_mode", async () => {
    await loginAsNewAdmin();
    const matter = await seedMatter();

    const created = await controller.createDeadline({
      matterId: matter.id,
      countingMode: "dias_corridos",
      days: 10,
      startDate: "2031-03-01", // a Saturday
      description: "Contestação",
    });
    expect(created.dueDate).toBe("2031-03-11");

    // Switching to dias_uteis: start day (Sat) isn't a business day, so the
    // effective start is Mon 2031-03-03; 10 business days later (no
    // holidays in range) lands on 2031-03-17.
    const edited = await controller.updateDeadline(created.id, { countingMode: "dias_uteis" });
    expect(edited.dueDate).toBe("2031-03-17");
    expect(edited.dueDate).not.toBe(created.dueDate);
  });

  it("an edit touching only description/isFatal does not recompute due_date (skips the holiday round trip)", async () => {
    await loginAsNewAdmin();
    const matter = await seedMatter();

    const created = await controller.createDeadline({
      matterId: matter.id,
      countingMode: "dias_corridos",
      days: 10,
      startDate: "2031-03-01",
      description: "Contestação",
    });

    const edited = await controller.updateDeadline(created.id, { description: "Nova descrição", isFatal: true });
    expect(edited.dueDate).toBe(created.dueDate);
    expect(edited.description).toBe("Nova descrição");
    expect(edited.isFatal).toBe(true);
  });

  it("marks a deadline cumprido; a pendente-filtered listing excludes it afterward", async () => {
    await loginAsNewAdmin();
    const matter = await seedMatter();

    const created = await controller.createDeadline({
      matterId: matter.id,
      countingMode: "dias_corridos",
      days: 10,
      startDate: "2031-03-01",
      description: "Contestação",
    });

    const pendingBefore = await controller.listDeadlines({ status: "pendente" });
    expect(pendingBefore.map((d) => d.id)).toContain(created.id);

    const done = await controller.markDeadlineCumprido(created.id);
    expect(done.status).toBe("cumprido");
    expect(await controller.getDeadline(created.id)).toMatchObject({ status: "cumprido" });

    const pendingAfter = await controller.listDeadlines({ status: "pendente" });
    expect(pendingAfter.map((d) => d.id)).not.toContain(created.id);

    const cumpridoList = await controller.listDeadlines({ status: "cumprido" });
    expect(cumpridoList.map((d) => d.id)).toContain(created.id);
  });
});

describe("deadlines.controller — role access", () => {
  it("admin, advogado, and secretario can all create, read, update, and mark a deadline cumprido (no role restricts deadlines access)", async () => {
    const tenantId = await seedTenant();
    const admin = await seedAdmin(tenantId);
    const advogado = await seedMember(tenantId, "advogado");
    const secretario = await seedMember(tenantId, "secretario");

    await tenants.login({ email: admin.email, password: admin.password });
    const matter = await seedMatter();
    await tenants.logout();

    for (const user of [admin, advogado, secretario]) {
      await tenants.login({ email: user.email, password: user.password });

      const created = await controller.createDeadline({
        matterId: matter.id,
        countingMode: "dias_corridos",
        days: 5,
        startDate: "2031-06-01",
        description: `Prazo de ${user.email}`,
      });
      expect(created.status).toBe("pendente");

      expect(await controller.getDeadline(created.id)).toMatchObject({ id: created.id });

      const edited = await controller.updateDeadline(created.id, { description: "Atualizado" });
      expect(edited.description).toBe("Atualizado");

      const done = await controller.markDeadlineCumprido(created.id);
      expect(done.status).toBe("cumprido");

      await tenants.logout();
    }
  });
});

describe("deadlines.controller — tags", () => {
  it("attach/detach a tag on a deadline works and never changes dueDate/isFatal/countingMode (ADR-0003)", async () => {
    await loginAsNewAdmin();
    const matter = await seedMatter();

    const created = await controller.createDeadline({
      matterId: matter.id,
      countingMode: "dias_corridos",
      days: 10,
      startDate: "2031-03-01",
      description: "Contestação",
      isFatal: true,
    });

    const tag = await tags.attachTagToDeadlineByName(created.id, `Urgente ${randomUUID()}`, "#ff0000");
    const attached = await tags.listTagsForDeadline(created.id);
    expect(attached.map((t) => t.id)).toContain(tag.id);

    await tags.detachTagFromDeadline(created.id, tag.id);
    const afterDetach = await tags.listTagsForDeadline(created.id);
    expect(afterDetach.map((t) => t.id)).not.toContain(tag.id);

    const unchanged = await controller.getDeadline(created.id);
    expect(unchanged).toMatchObject({
      dueDate: created.dueDate,
      isFatal: created.isFatal,
      countingMode: created.countingMode,
    });
  });
});
