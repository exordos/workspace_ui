/**
 * Tests for the deep linking module.
 *
 * Deep links enable navigation to specific streams, topics, messages, and DMs
 * via URL paths. They are used for shareable links, custom protocol handling
 * (workspace://), browser history, and cross-platform link opening.
 * Broken deep links mean users can't navigate to shared content.
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import { deeplink } from "./deeplinks";
import { setCurrentOrgRouteIdResolver } from "./org-route";

afterEach(() => {
  window.history.replaceState({}, "", "/");
  setCurrentOrgRouteIdResolver(null);
});

// Builder functions generate URL paths from entity IDs — used for programmatic navigation
describe("deeplink builders", () => {
  // Stream URL encodes stream ID and slug (e.g. /stream/5-general)
  it("toStream", () => {
    expect(deeplink.toStream(5, "general")).toBe("/stream/5-general");
  });

  // Special characters in stream names must be slugified to URL-safe form
  it("toStream with special chars", () => {
    expect(deeplink.toStream(10, "My Channel!")).toBe("/stream/10-my-channel");
  });

  // Topic URL adds a /topic/ segment for navigating within a stream
  it("toTopic", () => {
    expect(deeplink.toTopic(5, "general", "bugs")).toBe("/stream/5-general/topic/bugs");
  });

  // Spaces in topic names must be percent-encoded to produce valid URLs
  it("toTopic with spaces", () => {
    const result = deeplink.toTopic(5, "general", "my topic");
    expect(result).toContain("/topic/my%20topic");
  });

  // Message URLs include a ?msg= query param for scroll-to-message navigation
  it("toMessage", () => {
    const result = deeplink.toMessage(5, "general", "bugs", 12345);
    expect(result).toBe("/stream/5-general/topic/bugs?msg=12345");
  });

  // DM deep link uses the user's ID for one-on-one conversations
  it("toDm", () => {
    expect(deeplink.toDm(42)).toBe("/dm/42");
  });

  // Activity filters (starred, mentions) navigate to filtered activity views
  it("toActivity", () => {
    expect(deeplink.toActivity("starred")).toBe("/activity/starred");
    expect(deeplink.toActivity("mentions")).toBe("/activity/mentions");
  });

  // Static routes for non-chat pages
  it("static routes", () => {
    expect(deeplink.toCalendar()).toBe("/calendar");
    expect(deeplink.toMail()).toBe("/mail");
    expect(deeplink.toCalls()).toBe("/calls");
    expect(deeplink.toLicenses()).toBe("/licenses");
  });

  it("prefixes routes with current org scope", () => {
    setCurrentOrgRouteIdResolver(() => "chat.example.com");
    expect(deeplink.toDm(42)).toBe("/org/chat.example.com/dm/42");
    expect(deeplink.toStream(5, "general")).toBe("/org/chat.example.com/stream/5-general");
  });
});

// Parser extracts structured data from URL strings — inverse of builders
describe("deeplink parser", () => {
  // Stream URLs must extract the slug for router navigation
  it("parses stream URL", () => {
    const result = deeplink.parse("/stream/5-general");
    expect(result.type).toBe("stream");
    expect(result.streamSlug).toBe("5-general");
  });

  // Topic URLs must extract both stream slug and topic name
  it("parses topic URL", () => {
    const result = deeplink.parse("/stream/5-general/topic/bugs");
    expect(result.type).toBe("topic");
    expect(result.streamSlug).toBe("5-general");
    expect(result.topicName).toBe("bugs");
  });

  it("does not throw on malformed encoded topic segments", () => {
    const malformedTopicPath = "/stream/5-general/topic/%E0%A4%A";
    expect(() => deeplink.parse(malformedTopicPath)).not.toThrow();
    const result = deeplink.parse(malformedTopicPath);
    expect(result.type).toBe("topic");
    expect(result.topicName).toBe("%E0%A4%A");
  });

  // Message URLs extract the numeric message ID from the ?msg= param
  it("parses message URL", () => {
    const result = deeplink.parse("/stream/5-general/topic/bugs?msg=12345");
    expect(result.type).toBe("message");
    expect(result.messageId).toBe(12345);
  });

  it("ignores invalid msg query values in stream topic links", () => {
    const result = deeplink.parse("/stream/5-general/topic/bugs?msg=Infinity");
    expect(result.type).toBe("topic");
    expect(result.messageId).toBeUndefined();
  });

  it("ignores exponent-form msg query values in stream topic links", () => {
    const result = deeplink.parse("/stream/5-general/topic/bugs?msg=1e3");
    expect(result.type).toBe("topic");
    expect(result.messageId).toBeUndefined();
  });

  it("ignores hex-form msg query values in stream topic links", () => {
    const result = deeplink.parse("/stream/5-general/topic/bugs?msg=0x10");
    expect(result.type).toBe("topic");
    expect(result.messageId).toBeUndefined();
  });

  it("parses DM URL", () => {
    const result = deeplink.parse("/dm/42");
    expect(result.type).toBe("dm");
    expect(result.dmId).toBe("42");
  });

  it("parses org-scoped DM URL", () => {
    const result = deeplink.parse("/org/chat.example.com/dm/42");
    expect(result.type).toBe("dm");
    expect(result.dmId).toBe("42");
    expect(result.orgId).toBe("chat.example.com");
  });

  it("parses activity URL", () => {
    const result = deeplink.parse("/activity/starred");
    expect(result.type).toBe("activity");
    expect(result.filter).toBe("starred");
  });

  // Custom protocol (workspace://) is used by Electron for OS-level deep linking
  it("parses custom protocol URL", () => {
    const result = deeplink.parse("workspace://open/dm/42");
    expect(result.type).toBe("dm");
    expect(result.dmId).toBe("42");
  });

  // Full HTTPS URLs from shared links must also be parseable
  it("parses full https URL", () => {
    const result = deeplink.parse("https://app.example.com/stream/5-general");
    expect(result.type).toBe("stream");
  });

  // Unrecognized paths should return "unknown" type, not crash
  it("returns unknown for unrecognized", () => {
    const result = deeplink.parse("/something/else");
    expect(result.type).toBe("unknown");
  });

  it("handles static routes", () => {
    expect(deeplink.parse("/calendar").type).toBe("calendar");
    expect(deeplink.parse("/mail").type).toBe("mail");
    expect(deeplink.parse("/calls").type).toBe("calls");
  });

  // Input without leading slash should be normalized — tolerates sloppy input
  it("prepends slash when path has no leading slash", () => {
    const result = deeplink.parse("stream/5-general");
    expect(result.type).toBe("stream");
    expect(result.path).toBe("/stream/5-general");
  });
});

// toShareableUrl creates a shareable link appropriate for the current runtime
describe("toShareableUrl", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).electronAPI;
  });

  // In browser, shareable URL uses the current origin (https://app.example.com)
  it("returns origin + path in browser", () => {
    const result = deeplink.toShareableUrl("/stream/5-general");
    expect(result).toBe(`${window.location.origin}/stream/5-general`);
  });

  // In Electron, use custom protocol so the OS routes clicks to the desktop app
  it("returns custom protocol URL in Electron", () => {
    (window as unknown as Record<string, unknown>).electronAPI = {};
    const result = deeplink.toShareableUrl("/dm/42");
    expect(result).toBe("workspace://open/dm/42");
  });
});

// share() uses Web Share API (mobile) with clipboard fallback (desktop)
describe("share", () => {
  const savedClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "share", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, "clipboard", {
      value: savedClipboard,
      configurable: true,
      writable: true,
    });
  });

  // Web Share API is the preferred method on mobile browsers
  it("uses Web Share API when available", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: shareMock,
      configurable: true,
      writable: true,
    });

    const result = await deeplink.share({ title: "Test", url: "https://example.com" });
    expect(result).toBe(true);
    expect(shareMock).toHaveBeenCalledWith({
      title: "Test",
      url: "https://example.com",
    });
  });

  // User cancellation or permission denial should return false, not throw
  it("returns false when Web Share API throws", async () => {
    Object.defineProperty(navigator, "share", {
      value: vi.fn().mockRejectedValue(new Error("User cancelled")),
      configurable: true,
      writable: true,
    });

    const result = await deeplink.share({ title: "Test", url: "https://example.com" });
    expect(result).toBe(false);
  });

  // On desktop browsers without Web Share, fall back to clipboard copy
  it("falls back to clipboard when share API unavailable", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    const result = await deeplink.share({ title: "Test", url: "https://example.com" });
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith("https://example.com");
  });

  // Both APIs can fail (e.g. insecure context) — must handle gracefully
  it("returns false when clipboard also fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("not allowed")) },
      configurable: true,
      writable: true,
    });

    const result = await deeplink.share({ title: "Test", url: "https://example.com" });
    expect(result).toBe(false);
  });
});

// Edge case: stream names that are entirely special characters
describe("slugForStream edge cases", () => {
  // When all chars are stripped, a fallback slug "channel" must be used
  it("falls back to 'channel' when name is all special characters", () => {
    expect(deeplink.toStream(1, "!!!")).toBe("/stream/1-channel");
  });
});
