import * as React from "react";
import { Link } from "wouter";
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getClientesAtivos,
  getMattersEmAndamento,
  getFaturamento,
  getAReceber,
  getFaturamentoNoTempo,
  getMattersPorStatus,
  getClientesPorStatus,
  getVolumePorCatalogo,
  getPrazosCriticos,
  periodoBuckets,
  periodoBucketLabels,
  defaultPeriodoBucket,
  type PeriodoBucket,
} from "../reports.controller";
// Cross-module read of the matters module's own status enum/labels — allowed
// (only *.service.ts/*.repository.ts imports are boundary-restricted, see
// eslint.config.ts). Mirrors matters.controller's own component-level label
// maps (MattersTable.tsx/MatterDetailView.tsx) rather than centralizing a
// new shared export, matching this repo's existing precedent of a
// per-component label object.
import { matterStatuses, type MatterStatus } from "../../matters/matters.controller";

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const matterStatusLabels: Record<MatterStatus, string> = {
  rascunho: "Rascunho",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  arquivado: "Arquivado",
};

/** Shared loading/error/value envelope for the breakdown sections below —
 * same shape as `FigureState` (stat cards), generalized to a payload type
 * since these sections carry arrays/objects rather than a single number. */
interface SectionState<T> {
  value: T | null;
  loading: boolean;
  error: string | null;
}

function initialSectionState<T>(): SectionState<T> {
  return { value: null, loading: true, error: null };
}

/** Horizontal bar list shared by Matters por status, Volume por catálogo and
 * Clientes ativos por status ("simple bar list ... same style", per ticket
 * 02) — label + count + a bar sized by proportion to the largest count in
 * the list, filled with the wireframe's single data color. `Math.max(1, …)`
 * keeps a zero-data tenant's bars at 0% width instead of dividing by zero. */
function BarBreakdownList({ entries }: { entries: { label: string; count: number }[] }) {
  const max = Math.max(1, ...entries.map((entry) => entry.count));
  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => (
        <div key={entry.label} className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-sm">
            <span>{entry.label}</span>
            <span className="font-mono">{entry.count}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full"
              style={{ width: `${(entry.count / max) * 100}%`, backgroundColor: "var(--chart-4)" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

const AXIS_TICK_STYLE = { className: "font-mono", fontSize: 11, fill: "var(--muted-foreground)" };

/** Faturamento no tempo's area chart — first real usage of `recharts` in
 * this codebase (already a dependency, unused until now), so kept
 * deliberately simple: one série ("Renda"), the wireframe's single data
 * color for stroke/fill, `font-mono` axis ticks per the spec's
 * numeric-values rule. Always renders the full `data` array (one point per
 * day, zero-filled by reports.service.ts's `getFaturamentoNoTempo`) — a
 * zero-data tenant gets a flat zeroed chart, not an empty state, matching
 * the ticket's "zeroed chart ... not broken" requirement. */
function FaturamentoNoTempoChart({ data }: { data: { date: string; total: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(value: string) => value.slice(5)}
          tick={AXIS_TICK_STYLE}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          width={72}
          tickFormatter={(value: number) => currencyFormatter.format(value)}
          tick={AXIS_TICK_STYLE}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
        />
        <Tooltip
          formatter={(value: number) => currencyFormatter.format(value)}
          contentStyle={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
        />
        <Area type="monotone" dataKey="total" name="Renda" stroke="var(--chart-4)" fill="var(--chart-4)" fillOpacity={0.2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface FigureState {
  value: number | null;
  loading: boolean;
  error: string | null;
}

const initialFigureState: FigureState = { value: null, loading: true, error: null };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Não foi possível carregar o dado.";
}

/** Cards render nothing (not even the shell) once loaded with a `null`
 * value and no error — that's Faturamento/A receber's secretario-hidden
 * state (reports.service.ts), never a genuine figure (a real zero still
 * renders via `format(0)`). While loading, always show the skeleton
 * regardless of the placeholder `null` value. */
function StatCard({
  title,
  state,
  format,
}: {
  title: string;
  state: FigureState;
  format: (value: number) => string;
}) {
  if (!state.loading && !state.error && state.value === null) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {state.loading ? (
          <Skeleton className="h-8 w-24" />
        ) : state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : (
          <p className="font-mono text-2xl font-semibold">{format(state.value!)}</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Teaser card for the Prazos page's headline count — same `FigureState`
 * shape and skeleton/error handling as `StatCard` above, but the whole card
 * is a `wouter` `Link` to `/dashboard/prazos` (story 7). Calls the exact
 * same `getPrazosCriticos()` reports.controller.ts exports for the Prazos
 * page itself (ticket 04: "no separate/duplicate query") — this component
 * only reads `count` off that result, never recomputes it. No RBAC gating,
 * matching `getPrazosCriticos()` having none. */
function PrazosCriticosCard({ state }: { state: FigureState }) {
  return (
    <Link href="/dashboard/prazos" className="block rounded-xl">
      <Card className="h-full transition-colors hover:bg-accent">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Prazos Críticos</CardTitle>
        </CardHeader>
        <CardContent>
          {state.loading ? (
            <Skeleton className="h-8 w-24" />
          ) : state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : (
            <p className="font-mono text-2xl font-semibold">{state.value}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export function MetricasPage() {
  const [periodo, setPeriodo] = React.useState<PeriodoBucket>(defaultPeriodoBucket);
  const [clientesAtivos, setClientesAtivos] = React.useState<FigureState>(initialFigureState);
  const [mattersEmAndamento, setMattersEmAndamento] = React.useState<FigureState>(initialFigureState);
  const [faturamento, setFaturamento] = React.useState<FigureState>(initialFigureState);
  const [aReceber, setAReceber] = React.useState<FigureState>(initialFigureState);
  const [prazosCriticos, setPrazosCriticos] = React.useState<FigureState>(initialFigureState);
  const [faturamentoNoTempo, setFaturamentoNoTempo] = React.useState<
    SectionState<{ date: string; total: number }[]>
  >(initialSectionState);
  const [mattersPorStatus, setMattersPorStatus] = React.useState<SectionState<Record<MatterStatus, number>>>(
    initialSectionState,
  );
  const [volumePorCatalogo, setVolumePorCatalogo] = React.useState<
    SectionState<{ name: string; count: number }[]>
  >(initialSectionState);
  const [clientesPorStatus, setClientesPorStatus] = React.useState<
    SectionState<{ ativo: number; inativo: number }>
  >(initialSectionState);

  // Clientes ativos / Matters em andamento / A receber: not período-scoped
  // (ticket: "not affected by período selector") — each fetches once on
  // mount, independent of the others, so one slow card never blocks the
  // rest of the page.
  React.useEffect(() => {
    let cancelled = false;
    getClientesAtivos()
      .then((value) => !cancelled && setClientesAtivos({ value, loading: false, error: null }))
      .catch((err) => !cancelled && setClientesAtivos({ value: null, loading: false, error: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    getMattersEmAndamento()
      .then((value) => !cancelled && setMattersEmAndamento({ value, loading: false, error: null }))
      .catch((err) => !cancelled && setMattersEmAndamento({ value: null, loading: false, error: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    getAReceber()
      .then((value) => !cancelled && setAReceber({ value, loading: false, error: null }))
      .catch((err) => !cancelled && setAReceber({ value: null, loading: false, error: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, []);

  // Prazos Críticos: same passthrough call the Prazos page itself uses
  // (ticket 04: "no separate/duplicate query"), not período-scoped, fetched
  // once on mount independent of every other card on this page.
  React.useEffect(() => {
    let cancelled = false;
    getPrazosCriticos()
      .then(({ count }) => !cancelled && setPrazosCriticos({ value: count, loading: false, error: null }))
      .catch((err) => !cancelled && setPrazosCriticos({ value: null, loading: false, error: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, []);

  // Faturamento: re-fetches whenever período changes (ticket: "updates when
  // período changes").
  React.useEffect(() => {
    let cancelled = false;
    setFaturamento((s) => ({ ...s, loading: true, error: null }));
    getFaturamento(periodo)
      .then((value) => !cancelled && setFaturamento({ value, loading: false, error: null }))
      .catch((err) => !cancelled && setFaturamento({ value: null, loading: false, error: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [periodo]);

  // Faturamento no tempo: same período-dependent re-fetch as the Faturamento
  // card above — it's the same underlying metric, just charted over time.
  React.useEffect(() => {
    let cancelled = false;
    setFaturamentoNoTempo((s) => ({ ...s, loading: true, error: null }));
    getFaturamentoNoTempo(periodo)
      .then((value) => !cancelled && setFaturamentoNoTempo({ value, loading: false, error: null }))
      .catch((err) => !cancelled && setFaturamentoNoTempo({ value: null, loading: false, error: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [periodo]);

  // Matters por status / Volume por catálogo / Clientes ativos por status:
  // not período-scoped (same reasoning as Clientes ativos/Matters em
  // andamento above) — each fetches once on mount, independent of the
  // others and of the período-bound sections.
  React.useEffect(() => {
    let cancelled = false;
    getMattersPorStatus()
      .then((value) => !cancelled && setMattersPorStatus({ value, loading: false, error: null }))
      .catch((err) => !cancelled && setMattersPorStatus({ value: null, loading: false, error: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    getVolumePorCatalogo()
      .then((value) => !cancelled && setVolumePorCatalogo({ value, loading: false, error: null }))
      .catch((err) => !cancelled && setVolumePorCatalogo({ value: null, loading: false, error: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    getClientesPorStatus()
      .then((value) => !cancelled && setClientesPorStatus({ value, loading: false, error: null }))
      .catch((err) => !cancelled && setClientesPorStatus({ value: null, loading: false, error: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Métricas</h1>
        <select
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value as PeriodoBucket)}
          aria-label="Período"
        >
          {periodoBuckets.map((bucket) => (
            <option key={bucket} value={bucket}>
              {periodoBucketLabels[bucket]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Clientes ativos" state={clientesAtivos} format={(v) => String(v)} />
        <StatCard title="Matters em andamento" state={mattersEmAndamento} format={(v) => String(v)} />
        <StatCard title="Faturamento" state={faturamento} format={(v) => currencyFormatter.format(v)} />
        <StatCard title="A receber" state={aReceber} format={(v) => currencyFormatter.format(v)} />
        <PrazosCriticosCard state={prazosCriticos} />
      </div>

      {/* Faturamento no tempo renders nothing (not even the card shell) once
          loaded with a `null` value and no error — same secretario-hidden
          convention as the Faturamento/A receber stat cards above. */}
      {(faturamentoNoTempo.loading || faturamentoNoTempo.error || faturamentoNoTempo.value !== null) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Faturamento no tempo</CardTitle>
          </CardHeader>
          <CardContent>
            {faturamentoNoTempo.loading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : faturamentoNoTempo.error ? (
              <p role="alert" className="text-sm text-destructive">
                {faturamentoNoTempo.error}
              </p>
            ) : (
              <FaturamentoNoTempoChart data={faturamentoNoTempo.value!} />
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Matters por status</CardTitle>
          </CardHeader>
          <CardContent>
            {mattersPorStatus.loading ? (
              <Skeleton className="h-40 w-full" />
            ) : mattersPorStatus.error ? (
              <p role="alert" className="text-sm text-destructive">
                {mattersPorStatus.error}
              </p>
            ) : (
              <BarBreakdownList
                entries={matterStatuses.map((status) => ({
                  label: matterStatusLabels[status],
                  count: mattersPorStatus.value![status],
                }))}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Volume por item de catálogo</CardTitle>
          </CardHeader>
          <CardContent>
            {volumePorCatalogo.loading ? (
              <Skeleton className="h-40 w-full" />
            ) : volumePorCatalogo.error ? (
              <p role="alert" className="text-sm text-destructive">
                {volumePorCatalogo.error}
              </p>
            ) : volumePorCatalogo.value!.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum dado disponível.</p>
            ) : (
              <BarBreakdownList
                entries={volumePorCatalogo.value!.map((item) => ({ label: item.name, count: item.count }))}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Clientes ativos por status</CardTitle>
          </CardHeader>
          <CardContent>
            {clientesPorStatus.loading ? (
              <Skeleton className="h-20 w-full" />
            ) : clientesPorStatus.error ? (
              <p role="alert" className="text-sm text-destructive">
                {clientesPorStatus.error}
              </p>
            ) : (
              <BarBreakdownList
                entries={[
                  { label: "Ativos", count: clientesPorStatus.value!.ativo },
                  { label: "Inativos", count: clientesPorStatus.value!.inativo },
                ]}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
