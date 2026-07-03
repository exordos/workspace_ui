import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { renderWithProviders } from "~/test/render";
import { LicensesPage } from "./licenses-page.ui";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("~/shared/lib/navigation-history", () => ({
  useNavigationHistory: () => ({ goBack: vi.fn(), canGoBack: false }),
}));

vi.mock("~/generated/licenses.json", () => ({
  default: [
    {
      name: "alpha",
      version: "1.0.0",
      license: "MIT",
      repository: "",
      publisher: "Example",
    },
    {
      name: "beta",
      version: "2.0.0",
      license: "Apache-2.0",
      repository: "https://example.test/beta",
      publisher: "Example Org",
    },
  ],
}));

describe("LicensesPage", () => {
  afterEach(() => {
    navigateMock.mockClear();
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
  });

  it("navigates to app root when close is pressed without history and Workspace project", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LicensesPage />, { route: "/licenses" });

    await user.click(screen.getByRole("button", { name: /close/i }));

    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("navigates to Workspace messenger root when close is pressed with Workspace project", async () => {
    const user = userEvent.setup();
    useWorkspaceAuthStore.setState({
      currentAccountId: "account-a",
      runtimeGeneration: 1,
      sessions: [
        {
          accountId: "account-a",
          instanceId: "instance-a",
          organizationId: "workspace.example.com",
          organizationOrigin: "https://workspace.example.com",
          projectId: "project-a",
          userUuid: "a225223c-637c-4afa-918f-5f2798b9305f",
          login: "alice@example.com",
          accessToken: "access-token",
          runtimeGeneration: 1,
          profile: {
            uuid: "a225223c-637c-4afa-918f-5f2798b9305f",
            username: "alice",
            firstName: "Alice",
            lastName: "Workspace",
            email: "alice@example.com",
          },
        },
      ],
    });

    renderWithProviders(<LicensesPage />, { route: "/licenses" });

    await user.click(screen.getByRole("button", { name: /close/i }));

    expect(navigateMock).toHaveBeenCalledWith("/project/project-a/messenger");
  });

  it("uses full-width layout container for licenses content", () => {
    const { container } = renderWithProviders(<LicensesPage />);
    const pageRoot = container.firstElementChild;

    expect(pageRoot).not.toBeNull();
    expect(pageRoot).toHaveClass("w-full");
    expect(pageRoot).toHaveClass("h-full");
    expect(pageRoot).toHaveClass("overflow-hidden");
    expect(pageRoot).not.toHaveClass("max-w-narrow-page");
  });
});
