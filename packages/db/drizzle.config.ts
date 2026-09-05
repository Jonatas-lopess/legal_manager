import { defineConfig } from "drizzle-kit";

// SUPABASE_DB_URL — server-only, see .env.example. drizzle-kit only runs in
// dev/migration (PLANNING.md §4); runtime never opens a direct TCP connection.
export default defineConfig({
  schema: "./src/schema.ts",
  out: "../../supabase/migrations",
  dialect: "postgresql",
  // `auth.*` is Supabase-managed (GoTrue) — schema.ts never declares it,
  // so no need to filter it out of generated DDL.
  migrations: {
    // Supabase CLI applies migrations by filename order — match its
    // `<timestamp>_name.sql` convention instead of drizzle-kit's default
    // sequential `0000_name.sql`.
    prefix: "supabase",
  },
  dbCredentials: {
    url: process.env.SUPABASE_DB_URL!,
  },
});
