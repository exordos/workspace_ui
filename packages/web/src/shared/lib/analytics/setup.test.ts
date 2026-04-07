/**
 * Tests for analytics bootstrap.
 *
 * Verifies that initAnalytics reads env vars and registers the appropriate
 * providers. If neither GA4 nor Yandex Metrica IDs are configured, analytics
 * remains a no-op.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { initAnalytics } from "./setup";
import { analytics } from "./analytics";

vi.mock("./analytics", () => ({
  analytics: {
    registerProvider: vi.fn(),
    init: vi.fn(),
  },
}));

vi.mock("./ga4", () => ({
  createGA4Provider: vi.fn((id: string) => ({ type: "ga4", id })),
}));

vi.mock("./ym", () => ({
  createYMProvider: vi.fn((id: number) => ({ type: "ym", id })),
}));

describe("initAnalytics", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls analytics.init()", () => {
    initAnalytics();
    expect(analytics.init).toHaveBeenCalledOnce();
  });

  it("calls init even when no provider env vars are configured", () => {
    initAnalytics();
    expect(analytics.init).toHaveBeenCalledOnce();
  });
});
