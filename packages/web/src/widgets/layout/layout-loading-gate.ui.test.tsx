import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { t } from "~/i18n/i18n";
import type { ConnectionHealthSnapshot } from "~/shared/lib/connection-health";
import { LayoutConnectionBanner } from "./layout-connection-banner.ui";
import { LayoutLoadingGate } from "./layout-loading-gate.ui";

describe("LayoutLoadingGate", () => {
  it("renders children when not loading or blocked", () => {
    render(
      <LayoutLoadingGate showFullscreenLoader={false} showConnectionBlocked={false}>
        <div>shell-content</div>
      </LayoutLoadingGate>,
    );
    expect(screen.getByText("shell-content")).toBeInTheDocument();
  });

  it("shows connection banner above fullscreen loader when offline", () => {
    const offlineHealth: ConnectionHealthSnapshot = {
      phase: "offline",
      retryAfterMs: 0,
      lastFailureAt: null,
      reconnectAttempt: 0,
      failureReason: null,
      isReconnecting: false,
    };

    render(
      <div className="flex h-screen flex-col">
        <LayoutConnectionBanner online={false} health={offlineHealth} rateLimitSeconds={0} />
        <LayoutLoadingGate showFullscreenLoader showConnectionBlocked={false}>
          <div>shell-content</div>
        </LayoutLoadingGate>
      </div>,
    );

    expect(screen.getByTestId("connection-banner")).toBeInTheDocument();
    expect(screen.getByText(t("app.offline"))).toBeInTheDocument();
    expect(screen.getByText(t("app.loading"))).toBeInTheDocument();
    expect(screen.queryByText("shell-content")).not.toBeInTheDocument();
  });

  it("shows blocked screen with retry actions", () => {
    render(
      <LayoutLoadingGate showFullscreenLoader={false} showConnectionBlocked>
        <div>shell-content</div>
      </LayoutLoadingGate>,
    );
    expect(screen.getByText(t("app.connectionFailed"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("app.retryConnection") })).toBeInTheDocument();
    expect(screen.queryByText("shell-content")).not.toBeInTheDocument();
  });
});
