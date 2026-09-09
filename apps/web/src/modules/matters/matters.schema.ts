// packages/schema is the single source of truth for these shapes.
import type { MatterStatus } from "@legal-manager/schema";
export { createMatterInputSchema, updateMatterInputSchema, matterStatuses } from "@legal-manager/schema";
export type { CreateMatterInput, UpdateMatterInput, MatterStatus } from "@legal-manager/schema";

export interface Matter {
  id: string;
  clientId: string | null;
  matterCatalogItemId: string | null;
  status: MatterStatus;
  uf: string;
  comarca: string | null;
  municipio: string | null;
  description: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListMattersFilter {
  status?: MatterStatus;
  clientId?: string;
  search?: string;
}
