// Public API of the `payments` module (PLANNING §6) — the rest of the app
// (and every other module, e.g. `matters`) reaches payment CRUD only
// through this file, never payments.service.ts/payments.repository.ts
// directly (enforced by eslint-plugin-boundaries, see eslint.config.ts).
export { createPayment, listPaymentsForMatter, togglePaymentStatus } from "./payments.service";
export { paymentStatuses } from "./payments.schema";
export type { Payment, PaymentStatus, CreatePaymentInput } from "./payments.schema";
