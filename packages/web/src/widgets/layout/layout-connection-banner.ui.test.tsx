import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionHealthSnapshot } from "~/shared/lib/connection-health";
import { ELECTRON_MAC_TITLEBAR_STRIP_CLASS } from "~/shared/lib/electron-title-bar.lib";
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

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).electronAPI;
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
    expect(screen.getByRole("alert")).toHaveClass("bg-bg-elevated", "text-text-primary");
    expect(screen.getByText("app.offline")).toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: "app.retryConnection" });
    expect(retryButton).toHaveClass("bg-accent", "text-on-accent");

    fireEvent.click(retryButton);
    expect(requestReconnectMock).toHaveBeenCalledTimes(1);
  });

  it("does not auto-expand on hover and expands on click", () => {
    render(<LayoutConnectionBanner online={false} health={readyHealth} rateLimitSeconds={0} />);

    fireEvent.click(screen.getByRole("button", { name: "a11y.hideTopBanner" }));
    const collapsedTrigger = screen.getByRole("button", { name: "a11y.showTopBanner" });
    expect(collapsedTrigger).toBeInTheDocument();
    expect(collapsedTrigger).toHaveClass("group", "cursor-pointer");

    fireEvent.mouseEnter(collapsedTrigger);
    expect(screen.queryByRole("button", { name: "app.retryConnection" })).not.toBeInTheDocument();

    fireEvent.click(collapsedTrigger);
    expect(screen.getByRole("button", { name: "app.retryConnection" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "a11y.hideTopBanner" })).toBeInTheDocument();
  });

  it("does not auto-expand on focus and expands on keyboard click", () => {
    render(<LayoutConnectionBanner online={false} health={readyHealth} rateLimitSeconds={0} />);

    fireEvent.click(screen.getByRole("button", { name: "a11y.hideTopBanner" }));
    const collapsedTrigger = screen.getByRole("button", { name: "a11y.showTopBanner" });

    fireEvent.focus(collapsedTrigger);
    expect(screen.queryByRole("button", { name: "app.retryConnection" })).not.toBeInTheDocument();

    fireEvent.click(collapsedTrigger);
    expect(screen.getByRole("button", { name: "app.retryConnection" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "a11y.hideTopBanner" })).toBeInTheDocument();
  });

  it("does not auto-expand again during the same non-null episode", () => {
    const { rerender } = render(
      <LayoutConnectionBanner
        online
        health={{ ...readyHealth, phase: "degraded", failureReason: "network" }}
        rateLimitSeconds={0}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "a11y.hideTopBanner" }));

    rerender(<LayoutConnectionBanner online={false} health={readyHealth} rateLimitSeconds={0} />);
    expect(screen.getByRole("button", { name: "a11y.showTopBanner" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "app.retryConnection" })).not.toBeInTheDocument();
  });

  it("resets collapse state after the banner disappears and a new episode starts", () => {
    const { rerender } = render(
      <LayoutConnectionBanner online={false} health={readyHealth} rateLimitSeconds={0} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "a11y.hideTopBanner" }));

    rerender(<LayoutConnectionBanner online health={readyHealth} rateLimitSeconds={0} />);
    expect(screen.queryByTestId("layout-top-banner-host")).not.toBeInTheDocument();

    rerender(<LayoutConnectionBanner online={false} health={readyHealth} rateLimitSeconds={0} />);
    expect(screen.getByRole("button", { name: "app.retryConnection" })).toBeInTheDocument();
  });

  it("collapses on escape and restores focus to the collapsed strip", () => {
    render(<LayoutConnectionBanner online={false} health={readyHealth} rateLimitSeconds={0} />);

    fireEvent.keyDown(screen.getByTestId("layout-top-banner-expanded"), { key: "Escape" });

    const collapsedTrigger = screen.getByRole("button", { name: "a11y.showTopBanner" });
    expect(collapsedTrigger).toBeInTheDocument();
    expect(collapsedTrigger).toHaveFocus();
  });

  it("keeps a colored macOS reserve in collapsed state", () => {
    (window as unknown as Record<string, unknown>).electronAPI = {
      platform: "darwin",
      notifications: { show: vi.fn() },
    };

    render(<LayoutConnectionBanner online={false} health={readyHealth} rateLimitSeconds={0} />);

    expect(screen.getByTestId("layout-top-banner-mac-titlebar-strip")).toHaveClass(
      ELECTRON_MAC_TITLEBAR_STRIP_CLASS,
    );

    fireEvent.click(screen.getByRole("button", { name: "a11y.hideTopBanner" }));

    expect(screen.getByTestId("layout-top-banner-mac-titlebar-strip")).toHaveClass(
      ELECTRON_MAC_TITLEBAR_STRIP_CLASS,
      "bg-notice-base",
    );
    expect(screen.getByRole("button", { name: "a11y.showTopBanner" })).toBeInTheDocument();
  });
});
