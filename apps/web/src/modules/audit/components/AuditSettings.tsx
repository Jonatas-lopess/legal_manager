import * as React from "react";
import { Input } from "@/components/ui/input";
import {
  listAuditLog,
  auditActions,
  auditEntities,
  type AuditAction,
  type AuditEntity,
  type AuditLogEntry,
} from "../audit.controller";
import { useAuth } from "../../tenants/components/AuthProvider";

const actionVerbs: Record<AuditAction, string> = {
  insert: "Criou",
  update: "Editou",
  delete: "Excluiu",
};

const entityLabels: Record<AuditEntity, string> = {
  clients: "Cliente",
  matters: "Caso",
  payments: "Pagamento",
};

const SELECT_CLASS = "flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm";

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const timeFormatter = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });

/** `"22/10 14:02h"` — the frame's exact date/hora shape (spec.md's fidelity
 * check point 5), not a Data/Hora column pair. */
function formatDataHora(iso: string): string {
  const date = new Date(iso);
  return `${shortDateFormatter.format(date)} ${timeFormatter.format(date)}h`;
}

/** First 6 chars of the UUID — there's no sequential per-entity number in
 * this schema, the frame's "#1002" is invented example flavor (see this
 * ticket's own brief), not something to reproduce. */
function shortId(id: string): string {
  return id.slice(0, 6);
}

function actorLabel(actor: AuditLogEntry["actor"]): string {
  if (!actor) return "—";
  return actor.name ?? actor.email ?? "—";
}

function entityLabel(entity: string): string {
  return entityLabels[entity as AuditEntity] ?? entity;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Não foi possível carregar o registro de auditoria.";
}

/**
 * Auditoria tab content (Configurações — ui-shell-clientes-casos-config/05).
 * The one genuinely new backend slice in this feature: `audit.controller.ts`
 * is real (see audit.schema/repository/service.ts), this component is its
 * only consumer so far.
 *
 * Shape corrected against the actual drawn frame (spec.md fidelity check
 * point 5, 2026-09-11): a reverse-chronological list of composed narrative
 * lines (`"{data} {hora}h | {ator} | {verbo} {entidade} #{id curto}"`), not
 * a Data/Hora/Usuário/Ação/Entidade/ID column table. Pure log — no create/
 * edit/delete control anywhere, matching the DB grant (`audit_log` has no
 * client-reachable write grant; only the trigger writes it).
 *
 * The entidade/ação/date-range filter row above the list is an explicit
 * *addition* beyond what's drawn (usability, once there's real log volume),
 * not a fidelity item — kept as filter controls above narrative lines below,
 * never folded into a column table.
 *
 * RBAC: admin-only (see this ticket's Comments in
 * .scratch/ui-shell-clientes-casos-config/issues/05-configuracoes-auditoria.md
 * for the reasoning) — same `useAuth()`/`user?.role` gate
 * `PaymentPanel.tsx`/`MembersTable.tsx` already use elsewhere in
 * Configurações, checked here before the tab ever calls `listAuditLog`.
 */
export function AuditSettings() {
  const { user } = useAuth();
  const [entries, setEntries] = React.useState<AuditLogEntry[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [entityFilter, setEntityFilter] = React.useState<AuditEntity | "">("");
  const [actionFilter, setActionFilter] = React.useState<AuditAction | "">("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  const isAdmin = user?.role === "admin";

  const load = React.useCallback(async () => {
    try {
      setEntries(
        await listAuditLog({
          entity: entityFilter || undefined,
          action: actionFilter || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [entityFilter, actionFilter, dateFrom, dateTo]);

  React.useEffect(() => {
    if (!isAdmin) return;
    load();
  }, [isAdmin, load]);

  // `user` is `undefined` while the initial session lookup is in flight
  // (AuthProvider's own doc comment) — render nothing rather than flashing
  // the "sem acesso" message for a tenant admin on first paint.
  if (user === undefined) return null;

  if (!isAdmin) {
    return <p className="text-sm text-muted-foreground">Você não tem acesso a esta seção.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Registro de Auditoria</h2>
        <p className="text-sm text-muted-foreground">
          Histórico de criação, edição e exclusão de clientes, casos e pagamentos.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className={SELECT_CLASS}
          aria-label="Filtrar por entidade"
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value as AuditEntity | "")}
        >
          <option value="">Todas as entidades</option>
          {auditEntities.map((entity) => (
            <option key={entity} value={entity}>
              {entityLabels[entity]}
            </option>
          ))}
        </select>
        <select
          className={SELECT_CLASS}
          aria-label="Filtrar por ação"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value as AuditAction | "")}
        >
          <option value="">Todas as ações</option>
          {auditActions.map((action) => (
            <option key={action} value={action}>
              {actionVerbs[action]}
            </option>
          ))}
        </select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="Data inicial"
          className="h-9 w-36"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label="Data final"
          className="h-9 w-36"
        />
      </div>

      {entries === null ? (
        <p className="text-sm text-muted-foreground">Carregando registro de auditoria...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
      ) : (
        <ul className="flex flex-col text-sm">
          {entries.map((entry) => (
            <li key={entry.id} className="border-b py-2 last:border-0">
              · <span className="font-mono">{formatDataHora(entry.createdAt)}</span> | {actorLabel(entry.actor)} |{" "}
              {actionVerbs[entry.action]} {entityLabel(entry.entity)} #
              <span className="font-mono">{shortId(entry.entityId)}</span>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
