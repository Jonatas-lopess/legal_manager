import { describe, expect, it } from "vitest";
import { resolveDbUrl } from "../../_shared/db-url.ts";

describe("resolveDbUrl", () => {
  it("swaps the local CLI's underscored container host for the `db` alias", () => {
    expect(
      resolveDbUrl(
        "postgresql://postgres:postgres@supabase_db_legal_manager:5432/postgres",
      ),
    ).toBe("postgresql://postgres:postgres@db:5432/postgres");
  });

  it("leaves hosted/other hostnames untouched", () => {
    const hosted =
      "postgresql://postgres.abcd:pw@aws-0-sa-east-1.pooler.supabase.com:6543/postgres";
    expect(resolveDbUrl(hosted)).toBe(hosted);
  });

  it("returns an unparseable value as-is instead of throwing", () => {
    expect(resolveDbUrl("not a url")).toBe("not a url");
  });
});
