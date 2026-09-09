// packages/schema is the single source of truth for these shapes.
export { createTagInputSchema, updateTagInputSchema } from "@legal-manager/schema";
export type { CreateTagInput, UpdateTagInput } from "@legal-manager/schema";

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}
