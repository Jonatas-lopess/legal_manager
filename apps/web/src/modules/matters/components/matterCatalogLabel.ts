import type { Matter } from "../matters.controller";
import type { CatalogItem } from "../../catalog/catalog.controller";

// A short piece of a matter's description, appended to the catalog item
// name (see matterCatalogLabel below) — long enough to stay identifying
// ("Horas Extraordinárias", "Indenização Material") without letting a long
// free-text description blow out a table cell or the casos-detalhe page
// title.
const SHORT_DESCRIPTION_MAX_LENGTH = 60;

function shortenDescription(description: string): string {
  if (description.length <= SHORT_DESCRIPTION_MAX_LENGTH) return description;
  return `${description.slice(0, SHORT_DESCRIPTION_MAX_LENGTH - 1).trimEnd()}…`;
}

/**
 * The "ITEM DE CATÁLOGO / PROCESSO" composed label — casos-lista's second
 * column (`casos-lista` wireframe: "Recurso Trabalhista - Horas
 * Extraordinárias", "Contestação Cível - Indenização Material") and
 * casos-detalhe's page title reuse this *same* helper (ticket 03: "one
 * helper, two call sites, not two copies") rather than each composing their
 * own string. Catalog item name + a short piece of the matter's own
 * description when both are set; falls back to the matter's own
 * uf/description-based label (same shape DeadlinesTable.tsx's/
 * DeadlineDialog.tsx's local `matterLabel` and reports.service.ts's
 * `matterFallbackLabel` already use for a matter with no catalog item yet,
 * e.g. a `rascunho`) when the catalog item isn't set, or is set but the
 * matter has no description.
 */
export function matterCatalogLabel(matter: Matter, catalogItem: CatalogItem | undefined): string {
  if (!catalogItem) return `${matter.uf} — ${matter.description ?? matter.id.slice(0, 8)}`;
  if (!matter.description) return catalogItem.name;
  return `${catalogItem.name} - ${shortenDescription(matter.description)}`;
}
