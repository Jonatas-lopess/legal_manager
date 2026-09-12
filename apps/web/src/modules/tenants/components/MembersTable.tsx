import * as React from "react";
import { Button } from "@/components/ui/button";
import { listMembers, removeMember, type Member } from "../tenants.controller";
import { InviteUserDialog } from "./InviteUserDialog";
import { useAuth } from "./AuthProvider";

const roleLabels: Record<Member["role"], string> = {
  admin: "Admin",
  advogado: "Advogado(a)",
  secretario: "Secretário(a)",
};

// Monochrome slate + uppercase label pill — same shape/rule as every other
// status pill in this app (see ClientsTable.tsx's `BADGE_CLASS`): never
// color-coded. The frame draws these gendered per example person, but that's
// invented-name flavor, not a real requirement (fidelity check point 4) —
// `roleLabels` above keeps the existing combined-form labels.
const BADGE_CLASS = "rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-foreground";

/**
 * Equipe tab content (Configurações — ui-shell-clientes-casos-config/04).
 * Previously the de facto `/` home screen (removed there in ticket 01 when
 * the unified shell's avatar dropdown took over Configurações), now
 * relocated here — same component, new home, plus the "Excluir" action
 * (removeMember) that didn't exist anywhere in `tenants.*` before this
 * ticket. Roster of the caller's own tenant only (RLS).
 */
export function MembersTable() {
  const { user } = useAuth();
  const [members, setMembers] = React.useState<Member[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setMembers(await listMembers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar a equipe.");
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const adminCount = React.useMemo(() => (members ?? []).filter((m) => m.role === "admin").length, [members]);

  // Server-side is the real, authoritative enforcement for both guardrails
  // (see supabase/functions/tenants/service.ts's removeMember) — these two
  // checks only disable the button where the outcome is *statically*
  // knowable from data already on this screen, per the ticket's own
  // "disable in UI where the guardrail is statically known" note. Today
  // `isLastAdmin` is only ever true for the caller's own row (the admin-only
  // gate forces caller and target to be the same person whenever the target
  // is a tenant's sole admin — see service.ts's comment) so this duplicates
  // `isSelf` in practice, but it's kept as its own explicit check so the UI
  // doesn't silently rely on that coincidence if the role model ever grows
  // (e.g. a future role change/demotion flow).
  function isSelf(member: Member): boolean {
    return member.id === user?.id;
  }
  function isLastAdmin(member: Member): boolean {
    return member.role === "admin" && adminCount <= 1;
  }

  async function handleRemove(member: Member) {
    const label = member.name ?? member.email ?? "este usuário";
    if (!window.confirm(`Remover ${label} da equipe? Essa ação não pode ser desfeita.`)) return;

    setRemovingId(member.id);
    setError(null);
    try {
      await removeMember(member.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível remover o usuário.");
    } finally {
      setRemovingId(null);
    }
  }

  if (error) return <p role="alert">{error}</p>;
  if (!members) return null;

  const isAdmin = user?.role === "admin";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Equipe do Escritório</h2>
          <p className="text-sm text-muted-foreground">Controle permissões e acessos de advogados e secretários</p>
        </div>
        {isAdmin && <InviteUserDialog onInvited={load} />}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 font-medium uppercase">Nome do profissional</th>
            <th className="py-2 font-medium uppercase">E-mail de acesso</th>
            <th className="py-2 font-medium uppercase">Função</th>
            <th className="py-2 text-right font-medium uppercase">Ações</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const blocked = isSelf(member) || isLastAdmin(member);
            const blockedReason = isSelf(member)
              ? "Você não pode remover a si mesmo."
              : isLastAdmin(member)
                ? "Não é possível remover o último administrador do escritório."
                : undefined;
            return (
              <tr key={member.id} className="border-b last:border-0">
                <td className="py-2">{member.name ?? "—"}</td>
                <td className="py-2">{member.email ?? "—"}</td>
                <td className="py-2">
                  <span className={BADGE_CLASS}>{roleLabels[member.role]}</span>
                </td>
                <td className="py-2 text-right">
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={blocked || removingId === member.id}
                      title={blockedReason}
                      onClick={() => handleRemove(member)}
                    >
                      {removingId === member.id ? "Removendo..." : "Excluir"}
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
