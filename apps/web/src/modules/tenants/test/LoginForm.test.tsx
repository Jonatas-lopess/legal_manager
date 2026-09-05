import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { LoginForm } from "../components/LoginForm";
import { useAuth } from "../components/AuthProvider";
import * as controller from "../tenants.controller";

vi.mock("../components/AuthProvider", async () => {
  const actual = await vi.importActual<typeof import("../components/AuthProvider")>(
    "../components/AuthProvider",
  );
  return { ...actual, useAuth: vi.fn() };
});
vi.mock("../tenants.controller", async () => {
  const actual = await vi.importActual<typeof import("../tenants.controller")>("../tenants.controller");
  return { ...actual, login: vi.fn() };
});

const useAuthMock = vi.mocked(useAuth);
const loginMock = vi.mocked(controller.login);

function renderLoginForm() {
  const location = memoryLocation({ path: "/login", record: true });
  render(
    <Router hook={location.hook}>
      <LoginForm />
    </Router>,
  );
  return location;
}

describe("LoginForm", () => {
  it("logs in and navigates to / on success", async () => {
    const refresh = vi.fn();
    useAuthMock.mockReturnValue({ user: null, refresh });
    loginMock.mockResolvedValue(undefined);
    const location = renderLoginForm();

    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "admin@teste.local" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "Senha123456!" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith({
      email: "admin@teste.local",
      password: "Senha123456!",
    }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(location.history.at(-1)).toBe("/"));
  });

  it("shows an error and stays put on a failed login", async () => {
    useAuthMock.mockReturnValue({ user: null, refresh: vi.fn() });
    loginMock.mockRejectedValue(new Error("Invalid login credentials"));
    renderLoginForm();

    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "admin@teste.local" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid login credentials");
  });
});
