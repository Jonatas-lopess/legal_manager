import * as React from "react";
import { listMembers, type Member } from "../tenants.controller";
import { InviteUserDialog } from "./InviteUserDialog";
import { useAuth } from "./AuthProvider";

const roleLabels: Record<Member["role"], string> = {
  admin: "Admin",
  advogado: "Advogado(a)",
  secretario: "Secretário(a)",
};

/** Roster of the caller's own tenant only (RLS) — invite-and-list, no pending-vs-accepted status in the MVP. */
export function MembersTable() {
  const { user } = useAuth();
  const [members, setMembers] = React.useState<Member[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

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

  if (error) return <p role="alert">{error}</p>;
  if (!members) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Equipe</h2>
        {user?.role === "admin" && <InviteUserDialog onInvited={load} />}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 font-medium">Nome</th>
            <th className="py-2 font-medium">E-mail</th>
            <th className="py-2 font-medium">Função</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} className="border-b last:border-0">
              <td className="py-2">{member.name ?? "—"}</td>
              <td className="py-2">{member.email ?? "—"}</td>
              <td className="py-2">{roleLabels[member.role]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
