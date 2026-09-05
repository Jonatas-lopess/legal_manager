import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";

const stateFile = path.join(path.dirname(fileURLToPath(import.meta.url)), ".container-state.json");

let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    const { connectionString } = JSON.parse(readFileSync(stateFile, "utf8")) as {
      connectionString: string;
    };
    pool = new Pool({ connectionString });
    // Without a listener, a socket error on an idle connection (e.g. the
    // container stopping in global-setup's teardown while connections are
    // still pooled) becomes an unhandled 'error' event and can crash the
    // process after the suite already reported its results.
    pool.on("error", () => {});
  }
  return pool;
}

export interface TestTx {
  /** The one Postgres connection this test's transaction runs on. */
  client: PoolClient;
  /**
   * Simulates a request from `userId` the way PostgREST would after
   * verifying its JWT: sets the session's role to `authenticated` (the
   * connecting `postgres` role has BYPASSRLS, so RLS is a no-op without
   * this) and `request.jwt.claim.sub` so `auth.uid()` resolves to `userId`
   * (this image's `auth.uid()` reads that GUC directly, not a JSON blob).
   */
  asUser(userId: string): Promise<void>;
  /** Back to the real, bypass-RLS connection role, for further fixture setup. */
  asSuperuser(): Promise<void>;
}

/**
 * Runs `fn` inside a transaction that's always rolled back, so tests never
 * see each other's writes and need no manual cleanup. Starts as the
 * superuser (`postgres`) — arrange fixtures before the first `asUser`/
 * `asAnon` call, which downgrades the role for the rest of the transaction.
 */
export async function withTx<T>(fn: (tx: TestTx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const tx: TestTx = {
      client,
      async asUser(userId: string) {
        await client.query("set local role authenticated");
        await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      },
      async asSuperuser() {
        await client.query("reset role");
      },
    };
    return await fn(tx);
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}

export async function closeHarness() {
  await pool?.end();
}
