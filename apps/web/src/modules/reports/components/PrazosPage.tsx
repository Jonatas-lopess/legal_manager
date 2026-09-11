import * as React from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getPrazosCriticos, type PrazoGroups, type PrazoRow } from "../reports.controller";
// Cross-module read of the deadlines module's own highlight-value labels —
// allowed (only *.service.ts/*.repository.ts imports are boundary-
// restricted, see eslint.config.ts). The comparison itself is never
// reimplemented here: `getPrazosCriticos` (reports.service.ts) already
// delegates the vencido/vence-em-breve computation to
// deadlines.controller's `dueDateHighlight` — this file only needs the
// resulting union type to label the badge.
import type { DueDateHighlight } from "../../deadlines/deadlines.controller";

interface PageState {
  count: number;
  groups: PrazoGroups;
  loading: boolean;
  error: string | null;
}

const initialGroups: PrazoGroups = { vencido: [], hoje: [], proximos: [] };
const initialState: PageState = { count: 0, groups: initialGroups, loading: true, error: null };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Não foi possível carregar os prazos.";
}

// Monochrome slate + uppercase label for every status pill on this page —
// spec.md's deliberate design-token decision (search "no red/amber/green
// anywhere ... including on the Vencido/Fatal status pills, which render in
// slate + an uppercase label instead of color") and repeated under "Out of
// Scope" ("Assigning real semantic colors to status badges ... is a
// visual-design decision this wireframe doesn't make"). Deliberately NOT
// DeadlinesTable.tsx's red/amber/rose badges for these exact same
// `DueDateHighlight`/`isFatal` values — same pill shape (`rounded-full`,
// `text-[10px] font-semibold uppercase`), different (monochrome) color
// classes, applied identically to both the vencido/vence-em-breve badge and
// the Fatal badge.
const BADGE_CLASS = "rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-foreground";

const highlightLabel: Record<DueDateHighlight, string> = {
  vencido: "Vencido",
  vence_em_breve: "Vence em breve",
  on_track: "Em dia", // unreachable here — getPrazosCriticos already excludes on_track rows — kept only so this map stays exhaustive over the whole union.
};

const GROUP_DEFS: { key: keyof PrazoGroups; title: string }[] = [
  { key: "vencido", title: "Vencido" },
  { key: "hoje", title: "Hoje" },
  { key: "proximos", title: "Próximos" },
];

function PrazoRowItem({ row }: { row: PrazoRow }) {
  return (
    <div className="flex flex-col gap-1 border-b p-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{row.matterLabel}</span>
        <span className="text-sm text-muted-foreground">{row.description}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="font-mono text-sm">{row.dueDate}</span>
        <span className={BADGE_CLASS}>{highlightLabel[row.highlight]}</span>
        {row.isFatal && <span className={BADGE_CLASS}>Fatal</span>}
      </div>
    </div>
  );
}

function PrazoGroupSection({ title, rows }: { title: string; rows: PrazoRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
          <span>{title}</span>
          <span className="font-mono">{rows.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhum prazo.</p>
        ) : (
          <div className="flex flex-col">
            {rows.map((row) => (
              <PrazoRowItem key={row.id} row={row} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Prazos page (ticket 03) — forward-looking agenda, not a historical bucket:
 * no período selector at all (story 14), no RBAC gating (the page has no
 * `payments` data). Headline count + the three groups below it come from a
 * single `getPrazosCriticos()` call — same function ticket 04's Métricas
 * teaser card reuses, so the two screens never compute this twice.
 */
export function PrazosPage() {
  const [state, setState] = React.useState<PageState>(initialState);

  React.useEffect(() => {
    let cancelled = false;
    getPrazosCriticos()
      .then(({ count, groups }) => !cancelled && setState({ count, groups, loading: false, error: null }))
      .catch((err) => !cancelled && setState({ ...initialState, loading: false, error: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Prazos</h1>
        <Link href="/deadlines" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
          Ver todos os prazos catalogados
        </Link>
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
              <span className="rounded-full bg-primary px-4 py-2 font-mono text-3xl font-bold text-primary-foreground">
                {state.count}
              </span>
              <span className="text-sm text-muted-foreground">Prazos Críticos</span>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {state.loading ? (
          <>
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </>
        ) : state.error ? null : (
          GROUP_DEFS.map(({ key, title }) => <PrazoGroupSection key={key} title={title} rows={state.groups[key]} />)
        )}
      </div>
    </div>
  );
}
