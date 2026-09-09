// packages/schema is the single source of truth for these shapes.
import type { CountingMode, DeadlineStatus } from "@legal-manager/schema";
export {
  createDeadlineInputSchema,
  updateDeadlineInputSchema,
  countingModes,
  deadlineStatuses,
} from "@legal-manager/schema";
export type { CreateDeadlineInput, UpdateDeadlineInput, CountingMode, DeadlineStatus } from "@legal-manager/schema";

export interface Deadline {
  id: string;
  matterId: string;
  isFatal: boolean;
  countingMode: CountingMode;
  days: number;
  startDate: string;
  description: string;
  status: DeadlineStatus;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListDeadlinesFilter {
  matterId?: string;
  status?: DeadlineStatus;
}
