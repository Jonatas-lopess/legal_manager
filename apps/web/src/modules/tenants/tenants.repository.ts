import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { InviteUserInput, LoginInput } from "@legal-manager/schema";

export async function signInWithPassword(input: LoginInput) {
  return supabase.auth.signInWithPassword(input);
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function sendPasswordResetEmail(email: string) {
  // No `window` outside a browser (e.g. the service-level test suite) —
  // GoTrue falls back to its configured `site_url` when omitted.
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
  return supabase.auth.resetPasswordForEmail(email, { redirectTo });
}

export async function updatePassword(password: string) {
  return supabase.auth.updateUser({ password });
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(callback: (session: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return data.subscription;
}

interface OwnUserRow {
  id: string;
  tenant_id: string;
  role: "admin" | "advogado" | "secretario";
  name: string | null;
  email: string | null;
}

export async function fetchOwnUserRow(userId: string) {
  return supabase.from("users").select("id, tenant_id, role, name, email").eq("id", userId).maybeSingle<OwnUserRow>();
}

interface MemberRow {
  id: string;
  role: "admin" | "advogado" | "secretario";
  name: string | null;
  email: string | null;
}

/** RLS (`users_select_own_tenant`) — never another tenant's rows, no client filter needed. */
export async function fetchTenantMembers() {
  return supabase
    .from("users")
    .select("id, role, name, email")
    .order("created_at", { ascending: true })
    .returns<MemberRow[]>();
}

export async function inviteUser(input: InviteUserInput) {
  return supabase.functions.invoke<{ id: string; tenantId: string; role: string; email: string }>("tenants", {
    body: input,
  });
}
