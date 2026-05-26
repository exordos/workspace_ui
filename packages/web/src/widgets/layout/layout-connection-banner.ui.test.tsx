import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { ConnectionHealthSnapshot } from "~/shared/lib/connection-health";
import { LayoutConnectionBanner } from "./layout-connection-banner.ui";

vi.mock("~/i18n/i18n", () => ({
  t: (key: string) => key,
}));

const readyHealth: ConnectionHealthSnapshot = {
  phase: "ready",
  retryAfterMs: 0,
  lastFailureAt: null,
  reconnectAttempt: 0,
  failureReason: null,
  isReconnecting: false,
};

describe("LayoutConnectionBanner", () => {
  const reloadSpy = vi.fn();

  beforeEach(() => {
    reloadSpy.mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when there is no connection message", () => {
    const { container } = render(
      <LayoutConnectionBanner online health={readyHealth} rateLimitSeconds={0} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a prominent banner with reload control when offline", () => {
    render(<LayoutConnectionBanner online={false} health={readyHealth} rateLimitSeconds={0} />);

    expect(screen.getByRole("alert")).toHaveClass("bg-notice-base/20");
    expect(screen.getByText("app.offline")).toBeInTheDocument();
    const reloadButton = screen.getByRole("button", { name: "app.reload" });
    expect(reloadButton).toHaveClass("bg-accent", "text-on-accent");

    fireEvent.click(reloadButton);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
