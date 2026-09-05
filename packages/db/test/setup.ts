import { afterAll } from "vitest";
import { closeHarness } from "./harness";

// Each isolated test file gets its own harness.ts module instance (and so
// its own Pool) — close it after that file's tests finish rather than
// leaving idle connections open until the container itself goes away.
afterAll(async () => {
  await closeHarness();
});
