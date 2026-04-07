import { describe, expect, it } from "vitest";
import {
  buildActiveChatWindowTitle,
  computeInstanceUnreadCount,
  formatWebWindowTitleWithUnreadCount,
} from "./layout-instance-unread.lib";

describe("layout-instance-unread", () => {
  it("sums stream and DM unread badges", () => {
    expect(
      computeInstanceUnreadCount({
        streams: [{ badge: 2 }, { badge: 5 }],
        dms: [{ badge: 3 }],
      }),
    ).toBe(10);
  });

  it("ignores invalid badge values", () => {
    expect(
      computeInstanceUnreadCount({
        streams: [{ badge: undefined }, { badge: -4 }, { badge: Number.NaN }],
        dms: [{ badge: null }, { badge: 1.8 }],
      }),
    ).toBe(1);
  });

  it("formats web window title with unread count prefix", () => {
    expect(formatWebWindowTitleWithUnreadCount(5, "Workspace")).toBe("(5) Workspace");
    expect(formatWebWindowTitleWithUnreadCount(0, "Workspace")).toBe("Workspace");
  });

  it("normalizes invalid unread values in web window title", () => {
    expect(formatWebWindowTitleWithUnreadCount(-7, "Workspace")).toBe("Workspace");
    expect(formatWebWindowTitleWithUnreadCount(Number.NaN, "Workspace")).toBe("Workspace");
    expect(formatWebWindowTitleWithUnreadCount(3.9, "Workspace")).toBe("(3) Workspace");
  });

  it("includes active stream context in web window title", () => {
    expect(formatWebWindowTitleWithUnreadCount(2, "Workspace", "#general | #release")).toBe(
      "(2) #general | #release - Workspace",
    );
    expect(formatWebWindowTitleWithUnreadCount(0, "Workspace", "#general")).toBe(
      "#general - Workspace",
    );
  });

  it("includes active DM context in web window title", () => {
    expect(formatWebWindowTitleWithUnreadCount(4, "Workspace", "@Alice")).toBe(
      "(4) @Alice - Workspace",
    );
  });

  it("builds active window title from DM or stream context", () => {
    expect(
      buildActiveChatWindowTitle({
        dmName: "Alice",
        streamName: "general",
        topicName: "release",
      }),
    ).toBe("@Alice");
    expect(buildActiveChatWindowTitle({ streamName: "general", topicName: "release" })).toBe(
      "#general | #release",
    );
    expect(buildActiveChatWindowTitle({ streamName: "general" })).toBe("#general");
    expect(buildActiveChatWindowTitle({ streamName: "   ", topicName: "release" })).toBeNull();
  });
});
