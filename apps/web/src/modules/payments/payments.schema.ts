// packages/schema is the single source of truth for these shapes.
import type { PaymentStatus } from "@legal-manager/schema";
export { createPaymentInputSchema, paymentStatuses } from "@legal-manager/schema";
export type { CreatePaymentInput, PaymentStatus } from "@legal-manager/schema";

export interface Payment {
  id: string;
  matterId: string;
  value: number;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
}
