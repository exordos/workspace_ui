import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "~/test/render";
import { ServicesPage } from "./services-page.ui";
import type * as ReactRouterDom from "react-router-dom";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

describe("ServicesPage", () => {
  afterEach(() => {
    navigateMock.mockReset();
  });

  it("renders a full-page services hub with placeholder cards", () => {
    renderWithProviders(<ServicesPage />, { route: "/services" });

    expect(screen.getByRole("heading", { name: /^services$/i })).toBeInTheDocument();
    expect(screen.getByText(/knowledge base/i)).toBeInTheDocument();
    expect(screen.getAllByText(/coming soon/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /hide panel/i })).not.toBeInTheDocument();
  });

  it("navigates back to chats from the services page", () => {
    renderWithProviders(<ServicesPage />, { route: "/services" });
    fireEvent.click(screen.getByRole("button", { name: /chats\s*&\s*channels/i }));

    expect(navigateMock).toHaveBeenCalled();
  });
});
