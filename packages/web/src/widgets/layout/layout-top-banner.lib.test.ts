import { describe, expect, it } from "vitest";
import { resolveLayoutTopBannerKind } from "./layout-top-banner.lib";

describe("resolveLayoutTopBannerKind", () => {
  it("prioritizes connection over notification permission", () => {
    expect(resolveLayoutTopBannerKind("offline", true)).toBe("connection");
  });

  it("falls back to notification permission when connection is inactive", () => {
    expect(resolveLayoutTopBannerKind(null, true)).toBe("notification-permission");
  });

  it("returns null when no top banner is active", () => {
    expect(resolveLayoutTopBannerKind(null, false)).toBeNull();
  });
});
