// Public API of the `reports` module (PLANNING §6) — the rest of the app
// (and every other module) reaches reports/aggregate logic only through
// this file, never reports.service.ts/reports.repository.ts directly
// (enforced by eslint-plugin-boundaries, see eslint.config.ts).
export {
  getClientesAtivos,
  getMattersEmAndamento,
  getFaturamento,
  getAReceber,
  getFaturamentoNoTempo,
  getMattersPorStatus,
  getClientesPorStatus,
  getVolumePorCatalogo,
  getPrazosCriticos,
} from "./reports.service";
export { periodoBuckets, periodoBucketLabels, defaultPeriodoBucket } from "./reports.schema";
export type { PeriodoBucket, PrazoRow, PrazoGroups } from "./reports.schema";
