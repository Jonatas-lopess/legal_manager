import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { getDailySummary, type DailySummary } from "../insights.controller";

/**
 * Same loading/error/value envelope as MetricasPage.tsx's `SectionState` —
 * not imported from there (component-local state, not a shared type; that
 * file's own `SectionState` isn't exported either).
 */
export function DailySummaryCard() {
  const [value, setValue] = React.useState<DailySummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    getDailySummary()
      .then(setValue)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(load, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Resumo do dia</CardTitle>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          Atualizar
        </Button>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}
        {!loading && error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && !error && value && (
          <div className="flex flex-col gap-2">
            <p className="whitespace-pre-line text-sm">{value.summary}</p>
            <p className="text-xs text-muted-foreground">
              Gerado às {new Date(value.generatedAt).toLocaleTimeString("pt-BR")} — {value.stats.overdueCount}{" "}
              vencido(s), {value.stats.dueTodayCount} hoje, {value.stats.dueThisWeekCount} nos próximos 7 dias.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
