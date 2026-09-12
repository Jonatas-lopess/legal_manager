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

// Monochrome slate + uppercase label — same status-pill convention this
// ticket applies everywhere else (casos-lista's STATUS column, dashboard-
// reports' Vencido/Fatal badges), replacing the emerald/amber colored
// badges this panel used before.
const STATUS_PILL_CLASS = "rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-foreground";

/**
 * Fills `MatterDetailView.tsx`'s `data-slot="matter-payments-panel"`
 * placeholder: a matter's payment list (description + value formatted as
 * currency + status pill + a direction-specific action) plus a create form
 * (free-text description + value — status is implicitly `pendente` on
 * create, PLANNING §4's simplified "sem split" model, unchanged by ticket
 * 03's `description` column addition: no parcela-number/total columns, no
 * split logic).
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
  const [descriptionInput, setDescriptionInput] = React.useState("");
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
      await createPayment({ matterId, value, description: descriptionInput || undefined });
      setDescriptionInput("");
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
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="p-2 font-medium">Parcela/Descrição</th>
              <th className="p-2 font-medium">Valor</th>
              <th className="p-2 font-medium">Status</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className="border-b last:border-0">
                <td className="p-2">{payment.description ?? "—"}</td>
                <td className="p-2 font-mono">{currencyFormatter.format(payment.value)}</td>
                <td className="p-2">
                  <span className={STATUS_PILL_CLASS}>{statusLabels[payment.status]}</span>
                </td>
                <td className="p-2 text-right">
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => handleToggle(payment.id)}>
                    {payment.status === "pago" ? "Estornar" : "Marcar como pago"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={handleCreate} className="flex flex-wrap items-center gap-2">
        <Input
          value={descriptionInput}
          onChange={(e) => setDescriptionInput(e.target.value)}
          placeholder="Nova descrição de pagamento..."
          className="h-8 max-w-[16rem]"
          aria-label="Descrição do pagamento"
          disabled={busy}
        />
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
