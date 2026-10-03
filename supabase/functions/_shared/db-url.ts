// The local Supabase CLI injects SUPABASE_DB_URL with the db container's
// Docker hostname, `supabase_db_<project_id>`. Deno's own DNS resolver (used by
// `pg` through node:dns inside the edge runtime) rejects the underscores in
// that name ("Label contains invalid characters"), so every `pg.Pool` call
// fails with `getaddrinfo ENOTFOUND` even though glibc's `getent` resolves it.
// The same container is also reachable via the underscore-free network alias
// `db`, so swap that in. Any other hostname (hosted Supabase, a custom URL) is
// returned untouched.
// See .scratch/local-dev-infra/issues/01-edge-runtime-pg-dns-resolution.md.
const LOCAL_DB_HOST = /^supabase_db_/;

export function resolveDbUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  if (!LOCAL_DB_HOST.test(url.hostname)) return raw;
  url.hostname = "db";
  return url.toString();
}
