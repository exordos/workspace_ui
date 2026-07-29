import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CallsPage } from "./calls-page.ui";
import type * as ReactRouterDom from "react-router-dom";

const navigateSpy = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

describe("CallsPage", () => {
  afterEach(() => {
    navigateSpy.mockReset();
  });

  it("uses full-width layout container for calls content", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/calls"]}>
        <Routes>
          <Route path="/calls" element={<CallsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const pageRoot = container.firstElementChild;

    expect(pageRoot).not.toBeNull();
    expect(pageRoot).toHaveClass("w-full");
    expect(pageRoot).toHaveClass("flex-1");
    expect(pageRoot).not.toHaveClass("max-w-narrow-page");
  });

  it("renders calls title and empty state without loading legacy history", () => {
    render(
      <MemoryRouter initialEntries={["/calls"]}>
        <Routes>
          <Route path="/calls" element={<CallsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /recent jitsi calls/i })).toBeInTheDocument();
    expect(screen.getByText(/no recent jitsi calls yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
