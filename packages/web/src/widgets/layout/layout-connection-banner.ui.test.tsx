import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionHealthSnapshot } from "~/shared/lib/connection-health";
import { LayoutConnectionBanner } from "./layout-connection-banner.ui";

const requestReconnectMock = vi.fn();

vi.mock("~/i18n/i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("~/shared/lib/connection-health", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/lib/connection-health")>();
  return {
    ...actual,
    requestReconnect: (...args: unknown[]) => requestReconnectMock(...args),
  };
});

const readyHealth: ConnectionHealthSnapshot = {
  phase: "ready",
  retryAfterMs: 0,
  lastFailureAt: null,
  reconnectAttempt: 0,
  failureReason: null,
  isReconnecting: false,
};

describe("LayoutConnectionBanner", () => {
  beforeEach(() => {
    requestReconnectMock.mockReset();
  });

  it("renders nothing when there is no connection message", () => {
    const { container } = render(
      <LayoutConnectionBanner online health={readyHealth} rateLimitSeconds={0} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders an absolute overlay with retry action when offline", () => {
    render(<LayoutConnectionBanner online={false} health={readyHealth} rateLimitSeconds={0} />);

    expect(screen.getByTestId("layout-top-banner-host")).toHaveClass("absolute", "z-overlay");
    expect(screen.getByRole("alert")).toHaveClass("bg-bg-elevated", "text-notice-base");
    expect(screen.getByText("app.offline")).toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: "app.retryConnection" });
    expect(retryButton).toHaveClass("bg-accent", "text-on-accent");

    fireEvent.click(retryButton);
    expect(requestReconnectMock).toHaveBeenCalledTimes(1);
  });

  it("temporarily expands on hover and collapses back on mouse leave", () => {
    render(<LayoutConnectionBanner online={false} health={readyHealth} rateLimitSeconds={0} />);

    fireEvent.click(screen.getByRole("button", { name: "a11y.hideConnectionStatus" }));
    const collapsedTrigger = screen.getByRole("button", { name: "a11y.showConnectionStatus" });
    expect(collapsedTrigger).toBeInTheDocument();

    fireEvent.mouseEnter(collapsedTrigger);
    expect(screen.getByRole("button", { name: "app.retryConnection" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "a11y.keepConnectionStatusExpanded" }),
    ).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByTestId("layout-top-banner-expanded"));
    expect(screen.getByRole("button", { name: "a11y.showConnectionStatus" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "app.retryConnection" })).not.toBeInTheDocument();
  });

  it("keeps the banner expanded when the toggle is clicked from hover preview", () => {
    render(<LayoutConnectionBanner online={false} health={readyHealth} rateLimitSeconds={0} />);

    fireEvent.click(screen.getByRole("button", { name: "a11y.hideConnectionStatus" }));
    const collapsedTrigger = screen.getByRole("button", { name: "a11y.showConnectionStatus" });

    fireEvent.mouseEnter(collapsedTrigger);
    fireEvent.click(screen.getByRole("button", { name: "a11y.keepConnectionStatusExpanded" }));
    fireEvent.mouseLeave(screen.getByTestId("layout-top-banner-expanded"));

    expect(screen.getByRole("button", { name: "app.retryConnection" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "a11y.hideConnectionStatus" })).toBeInTheDocument();
  });

  it("expands on focus and moves focus into the expanded content", () => {
    render(<LayoutConnectionBanner online={false} health={readyHealth} rateLimitSeconds={0} />);

    fireEvent.click(screen.getByRole("button", { name: "a11y.hideConnectionStatus" }));
    const collapsedTrigger = screen.getByRole("button", { name: "a11y.showConnectionStatus" });
    fireEvent.blur(collapsedTrigger);

    fireEvent.focus(collapsedTrigger);
    expect(screen.getByRole("button", { name: "app.retryConnection" })).toHaveFocus();
  });

  it("does not auto-expand again during the same non-null episode", () => {
    const { rerender } = render(
      <LayoutConnectionBanner
        online
        health={{ ...readyHealth, phase: "degraded", failureReason: "network" }}
        rateLimitSeconds={0}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "a11y.hideConnectionStatus" }));

    rerender(<LayoutConnectionBanner online={false} health={readyHealth} rateLimitSeconds={0} />);
    expect(screen.getByRole("button", { name: "a11y.showConnectionStatus" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "app.retryConnection" })).not.toBeInTheDocument();
  });

  it("resets collapse state after the banner disappears and a new episode starts", () => {
    const { rerender } = render(
      <LayoutConnectionBanner online={false} health={readyHealth} rateLimitSeconds={0} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "a11y.hideConnectionStatus" }));

    rerender(<LayoutConnectionBanner online health={readyHealth} rateLimitSeconds={0} />);
    expect(screen.queryByTestId("layout-top-banner-host")).not.toBeInTheDocument();

    rerender(<LayoutConnectionBanner online={false} health={readyHealth} rateLimitSeconds={0} />);
    expect(screen.getByRole("button", { name: "app.retryConnection" })).toBeInTheDocument();
  });

  it("collapses on escape and restores focus to the collapsed strip", () => {
    render(<LayoutConnectionBanner online={false} health={readyHealth} rateLimitSeconds={0} />);

    fireEvent.keyDown(screen.getByTestId("layout-top-banner-expanded"), { key: "Escape" });

    const collapsedTrigger = screen.getByRole("button", { name: "a11y.showConnectionStatus" });
    expect(collapsedTrigger).toBeInTheDocument();
    expect(collapsedTrigger).toHaveFocus();
  });

  it("collapses temporary preview on escape and restores focus to the collapsed strip", () => {
    render(<LayoutConnectionBanner online={false} health={readyHealth} rateLimitSeconds={0} />);

    fireEvent.click(screen.getByRole("button", { name: "a11y.hideConnectionStatus" }));
    const collapsedTrigger = screen.getByRole("button", { name: "a11y.showConnectionStatus" });
    fireEvent.focus(collapsedTrigger);

    fireEvent.keyDown(screen.getByTestId("layout-top-banner-expanded"), { key: "Escape" });

    expect(screen.getByRole("button", { name: "a11y.showConnectionStatus" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "app.retryConnection" })).not.toBeInTheDocument();
  });
});
