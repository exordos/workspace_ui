/**
 * Tests for the deep linking module.
 *
 * Deep links enable navigation to specific streams, topics, and messages
 * via URL paths. They are used for shareable links, custom protocol handling
 * (ew://), browser history, and cross-platform link opening.
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
  it("toStream falls back to the app root without Workspace context", () => {
    expect(deeplink.toStream(5, "general")).toBe("/");
  });

  it("toStream builds Workspace route when UUID and project are present", () => {
    expect(
      deeplink.toStream(5, "general", {
        orgId: "chat.example.com",
        projectId: "project-uuid",
        streamUuid: "stream-uuid",
      }),
    ).toBe("/org/chat.example.com/project/project-uuid/stream/stream-uuid");
  });

  it("toStream uses the safe root fallback for incomplete Workspace context", () => {
    expect(deeplink.toStream(10, "My Channel!", { orgId: "chat.example.com" })).toBe(
      "/org/chat.example.com",
    );
  });

  it("toTopic falls back to the app root without Workspace context", () => {
    expect(deeplink.toTopic(5, "general", "bugs")).toBe("/");
  });

  it("toTopic builds Workspace topic route when UUIDs and project are present", () => {
    expect(
      deeplink.toTopic(5, "general", "bugs", {
        orgId: "chat.example.com",
        projectId: "project-uuid",
        streamUuid: "stream-uuid",
        topicUuid: "topic-uuid",
      }),
    ).toBe("/org/chat.example.com/project/project-uuid/stream/stream-uuid/topic/topic-uuid");
  });

  it("toTopic uses the safe root fallback when Workspace context is incomplete", () => {
    expect(
      deeplink.toTopic(5, "general", "bugs", {
        orgId: "chat.example.com",
        projectId: "project-uuid",
        streamUuid: "stream-uuid",
      }),
    ).toBe("/org/chat.example.com");
  });

  it("toMessage falls back to the app root without Workspace context", () => {
    expect(deeplink.toMessage(5, "general", "bugs", 12345)).toBe("/");
  });

  it("toMessage builds Workspace message route when UUID and project are present", () => {
    expect(
      deeplink.toMessage(5, "general", "bugs", 12345, {
        orgId: "chat.example.com",
        projectId: "project-uuid",
        messageUuid: "message-uuid",
      }),
    ).toBe("/org/chat.example.com/project/project-uuid/message/message-uuid");
  });

  it("toDm falls back to the app root without Workspace context", () => {
    expect(deeplink.toDm(42)).toBe("/");
  });

  it("toDm builds Workspace stream route when the direct stream UUID is present", () => {
    expect(
      deeplink.toDm(42, {
        orgId: "chat.example.com",
        projectId: "project-uuid",
        streamUuid: "direct-stream-uuid",
      }),
    ).toBe("/org/chat.example.com/project/project-uuid/stream/direct-stream-uuid");
  });

  it("toDm uses the topic route when a topic UUID is present", () => {
    expect(
      deeplink.toDm(42, {
        orgId: "chat.example.com",
        projectId: "project-uuid",
        streamUuid: "direct-stream-uuid",
        topicUuid: "topic-uuid",
      }),
    ).toBe("/org/chat.example.com/project/project-uuid/stream/direct-stream-uuid/topic/topic-uuid");
  });

  // Activity filters (starred, mentions) navigate to filtered Workspace views.
  it("toActivity builds a canonical Workspace route", () => {
    expect(
      deeplink.toActivity("starred", {
        orgId: "chat.example.com",
        projectId: "project-uuid",
      }),
    ).toBe("/org/chat.example.com/project/project-uuid/activity/starred");
    expect(
      deeplink.toActivity("mentions", {
        orgId: "chat.example.com",
        projectId: "project-uuid",
      }),
    ).toBe("/org/chat.example.com/project/project-uuid/activity/mentions");
  });

  it("toActivity falls back to the app root without Workspace context", () => {
    expect(deeplink.toActivity("starred")).toBe("/");
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
    expect(deeplink.toDm(42)).toBe("/org/chat.example.com");
    expect(deeplink.toStream(5, "general")).toBe("/org/chat.example.com");
  });
});

// Parser extracts structured data from URL strings — inverse of builders
describe("deeplink parser", () => {
  it("parses the canonical Workspace stream URL", () => {
    const result = deeplink.parse("/org/chat.example.com/project/project-uuid/stream/stream-uuid");
    expect(result.type).toBe("stream");
    expect(result.orgId).toBe("chat.example.com");
    expect(result.projectId).toBe("project-uuid");
    expect(result.streamUuid).toBe("stream-uuid");
  });

  it("parses the canonical Workspace topic URL", () => {
    const result = deeplink.parse(
      "/org/chat.example.com/project/project-uuid/stream/stream-uuid/topic/topic-uuid",
    );
    expect(result.type).toBe("topic");
    expect(result.projectId).toBe("project-uuid");
    expect(result.streamUuid).toBe("stream-uuid");
    expect(result.topicUuid).toBe("topic-uuid");
  });

  it("parses the canonical Workspace message URL", () => {
    const result = deeplink.parse(
      "/org/chat.example.com/project/project-uuid/message/message-uuid",
    );
    expect(result.type).toBe("message");
    expect(result.projectId).toBe("project-uuid");
    expect(result.messageUuid).toBe("message-uuid");
  });

  it("does not parse legacy chat URLs", () => {
    expect(deeplink.parse("/stream/5-general").type).toBe("unknown");
    expect(deeplink.parse("/dm/42").type).toBe("unknown");
    expect(deeplink.parse("/message/12345").type).toBe("unknown");
  });

  it("parses canonical Workspace activity URL", () => {
    const result = deeplink.parse("/org/chat.example.com/project/project-uuid/activity/starred");
    expect(result.type).toBe("activity");
    expect(result.projectId).toBe("project-uuid");
    expect(result.filter).toBe("starred");
  });

  it("does not parse a legacy unscoped activity URL", () => {
    expect(deeplink.parse("/activity/starred").type).toBe("unknown");
  });

  it("parses canonical Workspace URL from the custom protocol", () => {
    const result = deeplink.parse(
      "ew://open/org/chat.example.com/project/project-uuid/stream/stream-uuid/topic/topic-uuid",
    );
    expect(result.type).toBe("topic");
    expect(result.topicUuid).toBe("topic-uuid");
  });

  it("parses a full HTTPS Workspace URL", () => {
    const result = deeplink.parse(
      "https://app.example.com/org/chat.example.com/project/project-uuid/message/message-uuid",
    );
    expect(result.type).toBe("message");
    expect(result.messageUuid).toBe("message-uuid");
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

  it("returns unknown for incomplete Workspace routes", () => {
    expect(
      deeplink.parse("/org/chat.example.com/project/project-uuid/stream/stream-uuid/topic"),
    ).toMatchObject({ type: "unknown" });
  });
});

// toShareableUrl creates a shareable link appropriate for the current runtime
describe("toShareableUrl", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).electronAPI;
  });

  it("returns origin + canonical Workspace path in browser", () => {
    const result = deeplink.toShareableUrl(
      "/org/chat.example.com/project/project-uuid/stream/stream-uuid/topic/topic-uuid",
    );
    expect(result).toBe(
      `${window.location.origin}/org/chat.example.com/project/project-uuid/stream/stream-uuid/topic/topic-uuid`,
    );
  });

  it("uses the custom protocol for a canonical Workspace path in Electron", () => {
    (window as unknown as Record<string, unknown>).electronAPI = {};
    const result = deeplink.toShareableUrl(
      "/org/chat.example.com/project/project-uuid/message/message-uuid",
    );
    expect(result).toBe("ew://open/org/chat.example.com/project/project-uuid/message/message-uuid");
  });

  it("does not generate a legacy shareable path", () => {
    expect(deeplink.toShareableUrl("/dm/42")).toBe(`${window.location.origin}/`);
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

describe("toStream edge cases", () => {
  it("uses the app root when Workspace context is absent", () => {
    expect(deeplink.toStream(1, "!!!")).toBe("/");
  });
});
