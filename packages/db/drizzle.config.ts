import { defineConfig } from "drizzle-kit";

// SUPABASE_DB_URL — server-only, see .env.example. drizzle-kit only runs in
// dev/migration (PLANNING.md §4); runtime never opens a direct TCP connection.
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.SUPABASE_DB_URL!,
  },
});
