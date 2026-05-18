import { describe, expect, it } from "vitest";
import {
  buildActiveChatWindowTitle,
  computeInstanceDmUnreadCount,
  computeInstanceUnreadCount,
  computeTotalDmUnreadAcrossInstances,
  computeTotalUnreadAcrossInstances,
  formatWebWindowTitleWithUnreadCount,
  hasPersonalDmUnreadAcrossInstances,
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

  it("sums only personal (1:1) DM unread badges for app icon indicator", () => {
    expect(
      computeInstanceDmUnreadCount({
        dms: [{ badge: 3 }, { badge: 1, isGroup: true }],
      }),
    ).toBe(3);
    expect(
      computeInstanceDmUnreadCount({
        dms: [{ badge: 2 }],
      }),
    ).toBe(2);
  });

  it("hasPersonalDmUnreadAcrossInstances ignores orphan store keys", () => {
    expect(
      hasPersonalDmUnreadAcrossInstances({
        instances: [{ id: "inst-1" }],
        currentInstanceId: "inst-1",
        currentInstanceDmUnread: 0,
        dmUnreadCountsByInstance: { "inst-1": 0, "removed-org": 5 },
      }),
    ).toBe(false);
  });

  it("hasPersonalDmUnreadAcrossInstances uses live current org DM count", () => {
    expect(
      hasPersonalDmUnreadAcrossInstances({
        instances: [{ id: "a" }, { id: "b" }],
        currentInstanceId: "a",
        currentInstanceDmUnread: 2,
        dmUnreadCountsByInstance: { b: 0 },
      }),
    ).toBe(true);
  });

  it("sums DM unread counts across all instances for app icon badges", () => {
    expect(
      computeTotalDmUnreadAcrossInstances({
        "inst-1": 1,
        "inst-2": 2,
      }),
    ).toBe(3);
    expect(
      computeTotalDmUnreadAcrossInstances(
        { "inst-1": 0, "inst-2": 1 },
        { instanceId: "inst-1", unreadCount: 5 },
      ),
    ).toBe(6);
  });

  it("sums unread counts across all instances", () => {
    expect(
      computeTotalUnreadAcrossInstances({
        "inst-1": 3,
        "inst-2": 5,
      }),
    ).toBe(8);
    expect(computeTotalUnreadAcrossInstances({})).toBe(0);
    expect(
      computeTotalUnreadAcrossInstances({
        a: -2,
        b: Number.NaN,
        c: 2.9,
      }),
    ).toBe(2);
  });

  it("prefers live current-instance unread over stale store value", () => {
    expect(
      computeTotalUnreadAcrossInstances(
        { "inst-1": 0, "inst-2": 2 },
        { instanceId: "inst-1", unreadCount: 4 },
      ),
    ).toBe(6);
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
