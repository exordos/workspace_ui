import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "~/test/render";
import { LicensesPage } from "./licenses-page.ui";

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
