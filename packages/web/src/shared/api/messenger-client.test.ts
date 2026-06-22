/**
 * Tests for Messenger API (messenger-client module).
 */
import "./messenger.test.setup";
import { describe, expect, it, vi } from "vitest";
import { getCurrentInstance } from "./client";
import { getRealmBaseUrl } from "./messenger-client.internal";
import { TEST_INSTANCE } from "./messenger.test.setup";

describe("getRealmBaseUrl", () => {
  it("returns empty string when no instance", () => {
    vi.mocked(getCurrentInstance).mockReturnValue(null);
    expect(getRealmBaseUrl()).toBe("");
  });

  it("returns normalized realm URL", () => {
    expect(getRealmBaseUrl()).toBe("https://chat.example.com");
  });

  it("strips trailing /api/messenger/v1 from realm", () => {
    vi.mocked(getCurrentInstance).mockReturnValue({
      ...TEST_INSTANCE,
      realm: "https://chat.example.com/api/messenger/v1",
    });
    expect(getRealmBaseUrl()).toBe("https://chat.example.com");
  });

  it("strips trailing slashes", () => {
    vi.mocked(getCurrentInstance).mockReturnValue({
      ...TEST_INSTANCE,
      realm: "https://chat.example.com///",
    });
    expect(getRealmBaseUrl()).toBe("https://chat.example.com");
  });
});
