// Public API of the `catalog` module (PLANNING §6) — the rest of the app
// (and every other module, e.g. `matters`) reaches catalog CRUD only through
// this file, never catalog.service.ts/catalog.repository.ts directly
// (enforced by eslint-plugin-boundaries, see eslint.config.ts).
export { createCatalogItem, updateCatalogItem, getCatalogItem, listCatalogItems, deleteCatalogItem } from "./catalog.service";
export type { CatalogItem, CreateCatalogItemInput, UpdateCatalogItemInput } from "./catalog.schema";
