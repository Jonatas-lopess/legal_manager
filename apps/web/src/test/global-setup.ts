import path from "node:path";
import { fileURLToPath } from "node:url";

// vite/vitest only exposes VITE_-prefixed vars via `import.meta.env`; the
// integration tests' Node-side fixtures (tenants/test/harness.ts) need the
// server-only vars (SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL) from the
// same repo-root .env (see .env.example) in plain `process.env` instead.
export default function setup() {
  const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../.env");
  try {
    process.loadEnvFile(rootEnv);
  } catch {
    // Missing locally is fine if the real env vars are already set (CI).
  }
}
