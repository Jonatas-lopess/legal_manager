import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { RequireAuth } from "../components/RequireAuth";
import { useAuth } from "../components/AuthProvider";

vi.mock("../components/AuthProvider", async () => {
  const actual = await vi.importActual<typeof import("../components/AuthProvider")>(
    "../components/AuthProvider",
  );
  return { ...actual, useAuth: vi.fn() };
});

const useAuthMock = vi.mocked(useAuth);

function renderWithLocation(path: string) {
  const { hook } = memoryLocation({ path, record: true });
  return render(
    <Router hook={hook}>
      <Route path="/login">login page</Route>
      <Route path="/protected">
        <RequireAuth>protected content</RequireAuth>
      </Route>
    </Router>,
  );
}

describe("RequireAuth", () => {
  it("redirects to /login when there's no session", () => {
    useAuthMock.mockReturnValue({ user: null, refresh: vi.fn() });
    renderWithLocation("/protected");

    expect(screen.getByText("login page")).toBeInTheDocument();
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
  });

  it("renders children once a session is known", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", tenantId: "t1", role: "admin", name: null, email: "a@b.com" },
      refresh: vi.fn(),
    });
    renderWithLocation("/protected");

    expect(screen.getByText("protected content")).toBeInTheDocument();
  });

  it("renders nothing while the session lookup is in flight", () => {
    useAuthMock.mockReturnValue({ user: undefined, refresh: vi.fn() });
    renderWithLocation("/protected");

    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
    expect(screen.queryByText("login page")).not.toBeInTheDocument();
  });
});
