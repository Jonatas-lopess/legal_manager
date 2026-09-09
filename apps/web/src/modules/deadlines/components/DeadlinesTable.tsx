import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  listDeadlines,
  markDeadlineCumprido,
  deadlineStatuses,
  type Deadline,
  type DeadlineStatus,
} from "../deadlines.controller";
import { listMatters, type Matter } from "../../matters/matters.controller";
import { DeadlineTagPicker } from "../../tags/components/DeadlineTagPicker";
import { DeadlineDialog } from "./DeadlineDialog";

const statusLabels: Record<DeadlineStatus, string> = {
  pendente: "Pendente",
  cumprido: "Cumprido",
};

const countingModeLabels: Record<Deadline["countingMode"], string> = {
  dias_uteis: "Dias úteis",
  dias_corridos: "Dias corridos",
};

/** Same "matters have no simple name" labeling DeadlineDialog.tsx uses for
 * its picker — kept as a small local duplicate rather than a shared helper
 * module for two call sites (this codebase's own preference, see
 * DeadlineTagPicker.tsx's comment on the same tradeoff). */
function matterLabel(matter: Matter): string {
  return `${matter.uf} — ${matter.description ?? matter.id.slice(0, 8)}`;
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function addCalendarDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const d = new Date(year, month - 1, day + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Highlight = "vencido" | "vence_em_breve" | "on_track";

/**
 * Lightweight client-side heuristic (spec: "a simple heuristic distinct
 * from the engine's business-day precision... no separate report query") —
 * plain ISO string comparison against today's local date, no business-day
 * awareness at all (unlike computeDueDate). A `cumprido` deadline is always
 * "on_track" here: once satisfied, overdue/vence-em-breve triage no longer
 * applies to it (judgment call — the spec doesn't say either way).
 */
function dueDateHighlight(dueDate: string, status: DeadlineStatus): Highlight {
  if (status === "cumprido") return "on_track";
  const today = todayIso();
  if (dueDate < today) return "vencido";
  if (dueDate <= addCalendarDays(today, 5)) return "vence_em_breve";
  return "on_track";
}

const highlightRowClass: Record<Highlight, string> = {
  vencido: "bg-red-50",
  vence_em_breve: "bg-amber-50",
  on_track: "",
};

const highlightLabel: Record<Highlight, string | null> = {
  vencido: "Vencido",
  vence_em_breve: "Vence em breve",
  on_track: null,
};

const highlightBadgeClass: Record<Highlight, string> = {
  vencido: "bg-red-100 text-red-800",
  vence_em_breve: "bg-amber-100 text-amber-800",
  on_track: "",
};

export function DeadlinesTable() {
  const [deadlines, setDeadlines] = React.useState<Deadline[]>([]);
  const [matters, setMatters] = React.useState<Matter[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<DeadlineStatus | "">("");
  const [matterFilter, setMatterFilter] = React.useState("");
  const [dialogState, setDialogState] = React.useState<{ mode: "create" | "edit"; deadline: Deadline | null } | null>(
    null,
  );

  const matterById = React.useMemo(() => new Map(matters.map((m) => [m.id, m])), [matters]);

  React.useEffect(() => {
    listMatters().then(setMatters).catch(() => {});
  }, []);

  const fetchDeadlines = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listDeadlines({
        status: statusFilter || undefined,
        matterId: matterFilter || undefined,
      });
      setDeadlines(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os prazos.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, matterFilter]);

  React.useEffect(() => {
    fetchDeadlines();
  }, [fetchDeadlines]);

  async function handleMarkCumprido(deadline: Deadline) {
    try {
      await markDeadlineCumprido(deadline.id);
      await fetchDeadlines();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível marcar o prazo como cumprido.");
    }
  }

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4" data-testid="deadlines-table">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Prazos</h1>
        <Button onClick={() => setDialogState({ mode: "create", deadline: null })}>Novo prazo</Button>
      </div>

      <div className="flex gap-2">
        <select
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DeadlineStatus | "")}
        >
          <option value="">Todos os status</option>
          {deadlineStatuses.map((s) => (
            <option key={s} value={s}>
              {statusLabels[s]}
            </option>
          ))}
        </select>
        <select
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          value={matterFilter}
          onChange={(e) => setMatterFilter(e.target.value)}
        >
          <option value="">Todos os processos</option>
          {matters.map((m) => (
            <option key={m.id} value={m.id}>
              {matterLabel(m)}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="rounded-xl border">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Carregando...</p>
        ) : deadlines.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhum prazo encontrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3 font-medium">Processo</th>
                <th className="p-3 font-medium">Descrição</th>
                <th className="p-3 font-medium">Modo</th>
                <th className="p-3 font-medium">Vencimento</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Tags</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {deadlines.map((deadline) => {
                const highlight = dueDateHighlight(deadline.dueDate, deadline.status);
                const matter = matterById.get(deadline.matterId);
                return (
                  <tr key={deadline.id} className={`border-b last:border-0 ${highlightRowClass[highlight]}`}>
                    <td className="p-3">{matter ? matterLabel(matter) : "—"}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {deadline.description}
                        {deadline.isFatal && (
                          <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-rose-800">
                            Fatal
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{countingModeLabels[deadline.countingMode]}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {deadline.dueDate}
                        {highlightLabel[highlight] && (
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${highlightBadgeClass[highlight]}`}>
                            {highlightLabel[highlight]}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">{statusLabels[deadline.status]}</td>
                    <td className="p-3">
                      <DeadlineTagPicker deadlineId={deadline.id} />
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setDialogState({ mode: "edit", deadline })}>
                          Editar
                        </Button>
                        {deadline.status === "cumprido" ? (
                          <span className="self-center text-xs text-muted-foreground">Cumprido</span>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => handleMarkCumprido(deadline)}>
                            Marcar cumprido
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {dialogState && (
        <DeadlineDialog
          open
          mode={dialogState.mode}
          deadline={dialogState.deadline}
          onOpenChange={(open) => !open && setDialogState(null)}
          onSaved={fetchDeadlines}
        />
      )}
    </div>
  );
}
