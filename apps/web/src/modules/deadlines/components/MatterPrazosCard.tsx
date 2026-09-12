import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getPrazoBuckets,
  markDeadlineCumprido,
  type PrazoBucketDeadline,
  type PrazoBuckets,
} from "../deadlines.controller";
import { DeadlineDialog } from "./DeadlineDialog";
import { listTagsForDeadline, type Tag } from "../../tags/tags.controller";

interface MatterPrazosCardProps {
  matterId: string;
}

type Bucket = "vencido" | "hoje" | "proximos";

const GROUP_DEFS: { key: Bucket; title: string }[] = [
  { key: "vencido", title: "Vencido" },
  { key: "hoje", title: "Hoje" },
  { key: "proximos", title: "Próximos" },
];

const initialBuckets: PrazoBuckets = { count: 0, groups: { vencido: [], hoje: [], proximos: [] } };

// Same monochrome slate + uppercase pill convention as every other status/
// badge on this page (casos-lista's STATUS column, PaymentPanel's status
// pill, dashboard-reports' Vencido/Fatal badges) — never a per-value color.
const PILL_CLASS = "rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-foreground";

/** Read-only reproduction of TagPicker.tsx's/DeadlineTagPicker.tsx's chip
 * markup (dot + name, bordered in the tag's own color) — this card's badge
 * slot only ever *displays* a deadline's own tag, it never attaches/detaches
 * one, so the interactive picker itself isn't reused here, just its chip
 * rendering shape. */
function TagChip({ tag }: { tag: Tag }) {
  return (
    <span
      className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase"
      style={{ borderColor: tag.color }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} aria-hidden="true" />
      {tag.name}
    </span>
  );
}

function todayLocalIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function toUtcMs(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Per-bucket due-date text (ticket 03's fidelity check point 8): an
 * absolute date for vencido, a bare "Hoje" for hoje — no fabricated
 * time-of-day, `deadlines.dueDate` has no time component — and "Em N dias"
 * for próximos, N computed from the two calendar dates directly. */
function dueDateText(dueDate: string, bucket: Bucket, today: string): string {
  if (bucket === "vencido") return dueDate;
  if (bucket === "hoje") return "Hoje";
  const days = Math.round((toUtcMs(dueDate) - toUtcMs(today)) / 86_400_000);
  return `Em ${days} ${days === 1 ? "dia" : "dias"}`;
}

function PrazoRowItem({
  deadline,
  bucket,
  today,
  tag,
  busy,
  onMarkCumprido,
}: {
  deadline: PrazoBucketDeadline;
  bucket: Bucket;
  today: string;
  tag: Tag | undefined;
  busy: boolean;
  onMarkCumprido: (id: string) => void;
}) {
  // Bucket-derived, not the deadline's raw `status` enum (every row here is
  // already `pendente` — getPrazoBuckets only ever returns pendente rows) —
  // vencido reads distinctly from the group header's own "Vencido" label,
  // they're not redundant in the drawn frame (ticket 03).
  const statusLabel = bucket === "vencido" ? "Atrasado" : "Pendente";

  return (
    <li className="flex flex-col gap-1.5 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{deadline.description}</span>
        <span className="font-mono text-xs text-muted-foreground">{dueDateText(deadline.dueDate, bucket, today)}</span>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <span className={PILL_CLASS}>{statusLabel}</span>
        {deadline.isFatal ? <span className={PILL_CLASS}>● Fatal</span> : tag ? <TagChip tag={tag} /> : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => onMarkCumprido(deadline.id)}
        >
          Marcar cumprido
        </Button>
      </div>
    </li>
  );
}

/**
 * Fills `MatterDetailView.tsx`'s new `data-slot="matter-prazos-panel"` card
 * (ticket 03 of ui-shell-clientes-casos-config) — this matter's own
 * deadlines only (`getPrazoBuckets(matterId)`, `deadlines.controller`'s
 * shared vencido/hoje/próximos bucketing, not reimplemented here), a
 * "Marcar cumprido" action per row, and an inline "+ Novo prazo" trigger
 * that reuses `DeadlineDialog.tsx`'s full field set (pre-filled with this
 * `matterId`) rather than a second, standalone create form.
 */
export function MatterPrazosCard({ matterId }: MatterPrazosCardProps) {
  const [buckets, setBuckets] = React.useState<PrazoBuckets>(initialBuckets);
  const [tagsByDeadlineId, setTagsByDeadlineId] = React.useState<Map<string, Tag[]>>(new Map());
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setError(null);
    try {
      const result = await getPrazoBuckets(matterId);
      setBuckets(result);

      const allDeadlines = [...result.groups.vencido, ...result.groups.hoje, ...result.groups.proximos];
      const tagEntries = await Promise.all(
        allDeadlines.map(async (d) => [d.id, await listTagsForDeadline(d.id)] as const),
      );
      setTagsByDeadlineId(new Map(tagEntries));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os prazos.");
    } finally {
      setLoading(false);
    }
  }, [matterId]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleMarkCumprido(id: string) {
    setBusy(true);
    setError(null);
    try {
      await markDeadlineCumprido(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível marcar o prazo como cumprido.");
    } finally {
      setBusy(false);
    }
  }

  const today = todayLocalIso();

  return (
    <Card data-slot="matter-prazos-panel">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Prazos relacionados
        </CardTitle>
        <span className="text-sm text-muted-foreground">
          Total: <span className="font-mono">{buckets.count}</span> prazos mapeados
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando prazos...</p>
        ) : (
          <>
            {GROUP_DEFS.map(({ key, title }) => (
              <div key={key} className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">{title}</h3>
                {buckets.groups[key].length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum prazo.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {buckets.groups[key].map((deadline) => (
                      <PrazoRowItem
                        key={deadline.id}
                        deadline={deadline}
                        bucket={key}
                        today={today}
                        tag={tagsByDeadlineId.get(deadline.id)?.[0]}
                        busy={busy}
                        onMarkCumprido={handleMarkCumprido}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ))}

            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
                + Novo prazo
              </Button>
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </CardContent>

      {createOpen && (
        <DeadlineDialog
          open
          mode="create"
          deadline={null}
          initialMatterId={matterId}
          onOpenChange={setCreateOpen}
          onSaved={() => {
            void refresh();
          }}
        />
      )}
    </Card>
  );
}
