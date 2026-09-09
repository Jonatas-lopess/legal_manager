import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeadlineDialog } from "../components/DeadlineDialog";
import * as deadlinesController from "../deadlines.controller";
import * as mattersController from "../../matters/matters.controller";
import type { Deadline } from "../deadlines.schema";
import type { Matter } from "../../matters/matters.schema";

vi.mock("../deadlines.controller", async () => {
  const actual = await vi.importActual<typeof import("../deadlines.controller")>("../deadlines.controller");
  return { ...actual, createDeadline: vi.fn(), updateDeadline: vi.fn() };
});
vi.mock("../../matters/matters.controller", async () => {
  const actual = await vi.importActual<typeof import("../../matters/matters.controller")>(
    "../../matters/matters.controller",
  );
  return { ...actual, listMatters: vi.fn() };
});

const updateDeadlineMock = vi.mocked(deadlinesController.updateDeadline);
const listMattersMock = vi.mocked(mattersController.listMatters);

const matter: Matter = {
  id: "11111111-1111-1111-1111-111111111111",
  clientId: null,
  matterCatalogItemId: null,
  status: "rascunho",
  uf: "SP",
  comarca: null,
  municipio: null,
  description: "Processo Teste",
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const existingDeadline: Deadline = {
  id: "22222222-2222-2222-2222-222222222222",
  matterId: matter.id,
  isFatal: false,
  countingMode: "dias_corridos",
  days: 10,
  startDate: "2026-01-05",
  description: "Contestação",
  status: "pendente",
  dueDate: "2026-01-15",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("DeadlineDialog — edit mode only forwards actually-changed fields", () => {
  it("editing just the description does not include start_date/counting_mode/days/matterId/isFatal in the update payload", async () => {
    listMattersMock.mockResolvedValue([matter]);
    updateDeadlineMock.mockResolvedValue({ ...existingDeadline, description: "Contestação revisada" });

    render(
      <DeadlineDialog
        open
        mode="edit"
        deadline={existingDeadline}
        onOpenChange={() => {}}
        onSaved={() => {}}
      />,
    );

    await screen.findByRole("option", { name: /Processo Teste/ });

    fireEvent.change(screen.getByLabelText("Descrição *"), { target: { value: "Contestação revisada" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(updateDeadlineMock).toHaveBeenCalledTimes(1));
    expect(updateDeadlineMock).toHaveBeenCalledWith(existingDeadline.id, { description: "Contestação revisada" });
  });
});
