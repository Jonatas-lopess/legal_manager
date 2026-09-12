import * as React from "react";
import { Link } from "wouter";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TABLE_HEADER_ROW_CLASS } from "@/components/ui/table";
import { getPrazosCriticos, type PrazoGroups, type PrazoRow } from "../reports.controller";
// Cross-module reads of the deadlines module's own helpers — allowed (only
// *.service.ts/*.repository.ts imports are boundary-restricted, see
// eslint.config.ts). `todayLocalIso`/`toUtcMs` are the same date-math rail
// `MatterPrazosCard.tsx`'s `dueDateText` already uses for its own
// bucket-derived "Hoje"/"Em N dias" text — DATA FATAL/SITUAÇÃO reuse that
// exact per-bucket shape (no fabricated time-of-day for "Hoje", per 03's
// rule), worded once as a date and once as a status label.
import { todayLocalIso, toUtcMs } from "../../deadlines/deadlines.controller";
import { listTagsForDeadlines, type Tag } from "../../tags/tags.controller";

type Bucket = keyof PrazoGroups;

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

// Monochrome slate pill — same shape/rule as every other status pill in this
// app (ClientsTable.tsx's BADGE_CLASS): never color-coded per bucket.
const SITUACAO_PILL_CLASS = "rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-foreground";

interface PageState {
  count: number;
  groups: PrazoGroups;
  tagsByDeadlineId: Map<string, Tag[]>;
  loading: boolean;
  error: string | null;
}

const initialGroups: PrazoGroups = { vencido: [], hoje: [], proximos: [] };
const initialState: PageState = {
  count: 0,
  groups: initialGroups,
  tagsByDeadlineId: new Map(),
  loading: true,
  error: null,
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Não foi possível carregar os prazos.";
}

const GROUP_DEFS: { key: Bucket; title: string }[] = [
  { key: "vencido", title: "Vencido" },
  { key: "hoje", title: "Hoje" },
  { key: "proximos", title: "Próximos" },
];

const COLUMN_COUNT = 4;

function daysUntil(dueDate: string, today: string): number {
  return Math.round((toUtcMs(dueDate) - toUtcMs(today)) / 86_400_000);
}

/** SITUAÇÃO column — bucket-derived (VENCIDO/HOJE/EM N DIAS), never the raw
 * `deadlines.status` enum value. Same per-bucket shape as `MatterPrazosCard`'s
 * `dueDateText`, worded as a status rather than a date. */
function situacaoLabel(bucket: Bucket, dueDate: string, today: string): string {
  if (bucket === "vencido") return "VENCIDO";
  if (bucket === "hoje") return "HOJE";
  const days = daysUntil(dueDate, today);
  return `EM ${days} ${days === 1 ? "DIA" : "DIAS"}`;
}

/** DATA FATAL column — an absolute date for vencido, a bare "Hoje" for hoje
 * (no fabricated time-of-day — `deadlines.dueDate` has no time component,
 * same rule `MatterPrazosCard.tsx`'s `dueDateText` already applies), "Em N
 * dias" for próximos. */
function dataFatalLabel(bucket: Bucket, dueDate: string, today: string): string {
  if (bucket === "hoje") return "Hoje";
  if (bucket === "proximos") {
    const days = daysUntil(dueDate, today);
    return `Em ${days} ${days === 1 ? "dia" : "dias"}`;
  }
  return dateFormatter.format(new Date(toUtcMs(dueDate)));
}

/** RELEVÂNCIA column — plain text, not a pill (per the frame): fatal marker,
 * else the deadline's own tag if it has one, else "Comum". */
function relevanciaLabel(row: PrazoRow, tags: Tag[]): string {
  if (row.isFatal) return "● Fatal";
  if (tags.length > 0) return tags[0].name;
  return "Comum";
}

function GroupHeaderRow({ title }: { title: string }) {
  return (
    <tr className="bg-muted/40">
      <td colSpan={COLUMN_COUNT} className="p-2">
        <div className="flex items-center gap-2">
          <span className="h-4 w-1 rounded-full bg-foreground" aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        </div>
      </td>
    </tr>
  );
}

function PrazoDataRow({ row, bucket, today, tags }: { row: PrazoRow; bucket: Bucket; today: string; tags: Tag[] }) {
  return (
    <tr className="border-b last:border-0">
      <td className="p-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{row.matterLabel}</span>
          <span className="text-sm text-muted-foreground">{row.description}</span>
        </div>
      </td>
      <td className="p-3 text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="font-mono text-foreground">{dataFatalLabel(bucket, row.dueDate, today)}</span>
        </span>
      </td>
      <td className="p-3">
        <span className={SITUACAO_PILL_CLASS}>{situacaoLabel(bucket, row.dueDate, today)}</span>
      </td>
      <td className="p-3 text-sm">{relevanciaLabel(row, tags)}</td>
    </tr>
  );
}

/**
 * Prazos page (ticket 03, rebuilt ticket 11) — forward-looking agenda, not a
 * historical bucket: no período selector at all (story 14), no RBAC gating
 * (the page has no `payments` data). Headline count + the vencido/hoje/
 * próximos groups come from a single `getPrazosCriticos()` call — same
 * function ticket 04's Métricas teaser card reuses, so the two screens never
 * compute this twice. Rendered as one table (`4:164`), group buckets as
 * in-table accent-bar rows rather than three separate cards.
 */
export function PrazosPage() {
  const [state, setState] = React.useState<PageState>(initialState);
  const today = React.useMemo(() => todayLocalIso(), []);

  React.useEffect(() => {
    let cancelled = false;
    getPrazosCriticos()
      .then(async ({ count, groups }) => {
        const allIds = [...groups.vencido, ...groups.hoje, ...groups.proximos].map((row) => row.id);
        const tagsByDeadlineId = await listTagsForDeadlines(allIds);
        if (!cancelled) setState({ count, groups, tagsByDeadlineId, loading: false, error: null });
      })
      .catch((err) => !cancelled && setState({ ...initialState, loading: false, error: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, []);

  const totalRows = state.groups.vencido.length + state.groups.hoje.length + state.groups.proximos.length;

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Prazos</h1>
          <p className="text-sm text-muted-foreground">Acompanhamento de obrigações processuais urgentes</p>
        </div>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          Filtrado por:
          <span className="rounded-full border px-3 py-1 font-medium text-foreground">
            Próximos 5 dias ou já vencidos
          </span>
        </span>
      </div>

      <Card>
        <CardContent className="flex items-center gap-4 p-6">
          {state.loading ? (
            <Skeleton className="h-12 w-24" />
          ) : state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : (
            <>
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-2xl font-bold text-primary-foreground">
                {state.count}
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">Prazos Críticos Necessitando Ação</span>
                <span className="text-sm text-muted-foreground">
                  Existem {state.count} prazos processuais que expiram em até 5 dias úteis ou que já superaram a data
                  fatal de entrega.
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className={TABLE_HEADER_ROW_CLASS}>
                <th className="p-3 font-medium uppercase">Caso/Matter (Cliente — Detalhe)</th>
                <th className="p-3 font-medium uppercase">Data fatal</th>
                <th className="p-3 font-medium uppercase">Situação</th>
                <th className="p-3 font-medium uppercase">Relevância</th>
              </tr>
            </thead>
            <tbody>
              {state.loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td colSpan={COLUMN_COUNT} className="p-3">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : state.error ? null : totalRows === 0 ? (
                <tr>
                  <td colSpan={COLUMN_COUNT} className="p-10 text-center text-sm text-muted-foreground">
                    Nenhum prazo.
                  </td>
                </tr>
              ) : (
                GROUP_DEFS.filter(({ key }) => state.groups[key].length > 0).map(({ key, title }) => (
                  <React.Fragment key={key}>
                    <GroupHeaderRow title={title} />
                    {state.groups[key].map((row) => (
                      <PrazoDataRow
                        key={row.id}
                        row={row}
                        bucket={key}
                        today={today}
                        tags={state.tagsByDeadlineId.get(row.id) ?? []}
                      />
                    ))}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button variant="outline" asChild>
          <Link href="/deadlines">Ver todos os prazos catalogados</Link>
        </Button>
      </div>
    </div>
  );
}
