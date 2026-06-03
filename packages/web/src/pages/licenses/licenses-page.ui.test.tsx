import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
  it("navigates to messenger when close is pressed without history", async () => {
    const user = userEvent.setup();
    navigateMock.mockClear();
    renderWithProviders(<LicensesPage />, { route: "/licenses" });

    await user.click(screen.getByRole("button", { name: /close/i }));

    expect(navigateMock).toHaveBeenCalledWith("/stream/general");
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
