import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPayment, listPaymentsForMatter, togglePaymentStatus, type Payment } from "../payments.controller";
import { getCurrentUser } from "../../tenants/tenants.controller";

interface PaymentPanelProps {
  matterId: string;
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const statusLabels: Record<Payment["status"], string> = {
  pago: "Pago",
  pendente: "Pendente",
};

/**
 * Fills `MatterDetailView.tsx`'s `data-slot="matter-payments-panel"`
 * placeholder (ticket 05): a matter's payment list (value formatted as
 * currency + status badge) plus a create form (value only — status is
 * implicitly `pendente` on create, PLANNING §4's simplified "sem split"
 * model) and a per-row status-toggle button.
 *
 * Hidden entirely for `secretario` (story 31): checked here via
 * `getCurrentUser()` before anything else, so the UI never even attempts a
 * call `payments.service.ts` would reject anyway — matches the server-side
 * rejection rather than just papering over it.
 */
export function PaymentPanel({ matterId }: PaymentPanelProps) {
  const [allowed, setAllowed] = React.useState<boolean | null>(null);
  const [payments, setPayments] = React.useState<Payment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [valueInput, setValueInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setError(null);
    try {
      setPayments(await listPaymentsForMatter(matterId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os pagamentos.");
    } finally {
      setLoading(false);
    }
  }, [matterId]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = await getCurrentUser();
      if (cancelled) return;
      if (!user || user.role === "secretario") {
        setAllowed(false);
        setLoading(false);
        return;
      }
      setAllowed(true);
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function withBusyGuard(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar os pagamentos.");
    } finally {
      setBusy(false);
    }
  }

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(valueInput.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return;

    void withBusyGuard(async () => {
      await createPayment({ matterId, value });
      setValueInput("");
    });
  }

  function handleToggle(paymentId: string) {
    void withBusyGuard(async () => {
      await togglePaymentStatus(paymentId);
    });
  }

  if (allowed === false) {
    return <p className="text-sm text-muted-foreground">Você não tem acesso a esta seção.</p>;
  }

  if (loading || allowed === null) {
    return <p className="text-sm text-muted-foreground">Carregando pagamentos...</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum pagamento registrado ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Pagamentos">
          {payments.map((payment) => (
            <li
              key={payment.id}
              className="flex items-center justify-between gap-2 rounded border px-3 py-1.5 text-sm"
            >
              <span>{currencyFormatter.format(payment.value)}</span>
              <div className="flex items-center gap-2">
                <span
                  className={
                    payment.status === "pago"
                      ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800"
                      : "rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
                  }
                >
                  {statusLabels[payment.status]}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => handleToggle(payment.id)}
                >
                  Marcar como {payment.status === "pago" ? "pendente" : "pago"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleCreate} className="flex flex-wrap items-center gap-2">
        <Input
          value={valueInput}
          onChange={(e) => setValueInput(e.target.value)}
          placeholder="Valor (R$)"
          inputMode="decimal"
          className="h-8 max-w-[10rem]"
          aria-label="Valor do pagamento"
          disabled={busy}
        />
        <Button type="submit" size="sm" variant="outline" disabled={busy || !valueInput.trim()}>
          Registrar pagamento
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
