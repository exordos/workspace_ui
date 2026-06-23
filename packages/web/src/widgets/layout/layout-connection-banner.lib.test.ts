import { describe, expect, it, vi } from "vitest";
import type { ConnectionHealthSnapshot } from "~/shared/lib/connection-health";
import {
  resolveLayoutConnectionBannerMessage,
  resolveLayoutConnectionBannerSeverity,
} from "./layout-connection-banner.lib";

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

describe("resolveLayoutConnectionBannerMessage", () => {
  it("shows offline when navigator is offline", () => {
    expect(resolveLayoutConnectionBannerMessage(false, readyHealth, 0)).toBe("app.offline");
  });

  it("shows offline when health phase is offline even if navigator reports online", () => {
    expect(
      resolveLayoutConnectionBannerMessage(true, { ...readyHealth, phase: "offline" }, 0),
    ).toBe("app.offline");
  });

  it("shows degraded when API transport failed but navigator is online", () => {
    expect(
      resolveLayoutConnectionBannerMessage(
        true,
        { ...readyHealth, phase: "degraded", failureReason: "network" },
        0,
      ),
    ).toBe("app.connectionDegraded");
  });

  it("marks offline and blocked states as critical severity", () => {
    expect(resolveLayoutConnectionBannerSeverity(false, readyHealth)).toBe("critical");
    expect(resolveLayoutConnectionBannerSeverity(true, { ...readyHealth, phase: "blocked" })).toBe(
      "critical",
    );
  });

  it("marks reconnecting and degraded states as warning severity", () => {
    expect(
      resolveLayoutConnectionBannerSeverity(true, {
        ...readyHealth,
        phase: "degraded",
        failureReason: "network",
      }),
    ).toBe("warning");
    expect(
      resolveLayoutConnectionBannerSeverity(true, { ...readyHealth, isReconnecting: true }),
    ).toBe("warning");
  });
});
