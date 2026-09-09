// packages/schema is the single source of truth for these shapes.
export { createCatalogItemInputSchema, updateCatalogItemInputSchema } from "@legal-manager/schema";
export type { CreateCatalogItemInput, UpdateCatalogItemInput } from "@legal-manager/schema";

export interface CatalogItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}
