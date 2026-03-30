/**
 * Tests for Zulip API (zulip-client module).
 */
import "./zulip.test.setup";
import { describe, expect, it, vi } from "vitest";
import { getCurrentInstance } from "./client";
import { getRealmBaseUrl } from "./zulip-client.internal";
import { TEST_INSTANCE } from "./zulip.test.setup";

describe("getRealmBaseUrl", () => {
  it("returns empty string when no instance", () => {
    vi.mocked(getCurrentInstance).mockReturnValue(null);
    expect(getRealmBaseUrl()).toBe("");
  });

  it("returns normalized realm URL", () => {
    expect(getRealmBaseUrl()).toBe("https://zulip.example.com");
  });

  it("strips trailing /api/v1 from realm", () => {
    vi.mocked(getCurrentInstance).mockReturnValue({
      ...TEST_INSTANCE,
      realm: "https://zulip.example.com/api/v1",
    });
    expect(getRealmBaseUrl()).toBe("https://zulip.example.com");
  });

  it("strips trailing /api from realm", () => {
    vi.mocked(getCurrentInstance).mockReturnValue({
      ...TEST_INSTANCE,
      realm: "https://zulip.example.com/api",
    });
    expect(getRealmBaseUrl()).toBe("https://zulip.example.com");
  });

  it("strips trailing slashes", () => {
    vi.mocked(getCurrentInstance).mockReturnValue({
      ...TEST_INSTANCE,
      realm: "https://zulip.example.com///",
    });
    expect(getRealmBaseUrl()).toBe("https://zulip.example.com");
  });
});
