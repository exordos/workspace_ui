import { describe, expect, it } from "vitest";
import {
  buildActiveChatWindowTitle,
  computeInstanceDmUnreadCount,
  computeInstanceUnreadCount,
  computeTotalDmUnreadAcrossInstances,
  computeTotalUnreadAcrossInstances,
  formatWebWindowTitleWithUnreadCount,
  hasPersonalDmUnreadForActiveInstance,
  hasPersonalUnreadIndicator,
  isPersonalDmUnreadEntry,
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

  it("excludes muted topic unread from instance total when mute predicate is provided", () => {
    expect(
      computeInstanceUnreadCount({
        streams: [
          {
            stream_id: 10,
            topics: [
              { subject: "release", badge: 2 },
              { subject: "incidents", badge: 3 },
            ],
          },
        ],
        dms: [{ badge: 4 }],
        isEffectivelyMuted: (streamId, topic) => streamId === 10 && topic === "incidents",
      }),
    ).toBe(2 + 4);
  });

  it("excludes muted streams from instance total when stream mute predicate is provided", () => {
    expect(
      computeInstanceUnreadCount({
        streams: [
          { stream_id: 10, topics: [{ subject: "release", badge: 2 }] },
          { stream_id: 11, topics: [{ subject: "bugs", badge: 5 }] },
        ],
        dms: [],
        isStreamMuted: (streamId) => streamId === 11,
      }),
    ).toBe(2);
  });

  it("falls back to stream badge when topics are missing, still respecting stream mute", () => {
    expect(
      computeInstanceUnreadCount({
        streams: [
          { stream_id: 10, badge: 2 },
          { stream_id: 11, badge: 5 },
        ],
        dms: [],
        isStreamMuted: (streamId) => streamId === 11,
      }),
    ).toBe(2);
  });

  it("sums only personal (1:1) DM unread badges for app icon indicator", () => {
    expect(
      computeInstanceDmUnreadCount({
        dms: [
          { badge: 3, slug: "10-alice" },
          { badge: 1, isGroup: true, slug: "7-alice,42-bob,51-carol" },
        ],
        currentUserId: 7,
      }),
    ).toBe(3);
    expect(
      computeInstanceDmUnreadCount({
        dms: [{ badge: 2 }],
      }),
    ).toBe(2);
  });

  it("excludes huddle unread when isGroup and slug both imply a group DM", () => {
    expect(
      isPersonalDmUnreadEntry({ isGroup: true, slug: "7-alice,42-bob,51-carol", badge: 2 }, 7),
    ).toBe(false);
    expect(
      computeInstanceDmUnreadCount({
        currentUserId: 7,
        dms: [
          { badge: 4, slug: "7-alice,42-bob" },
          { badge: 2, isGroup: true, slug: "7-alice,42-bob,51-carol" },
        ],
      }),
    ).toBe(4);
  });

  it("hasPersonalDmUnreadForActiveInstance reflects only current org sidebar DM unread", () => {
    expect(hasPersonalDmUnreadForActiveInstance(0)).toBe(false);
    expect(hasPersonalDmUnreadForActiveInstance(2)).toBe(true);
    expect(hasPersonalDmUnreadForActiveInstance(-1)).toBe(false);
    expect(hasPersonalDmUnreadForActiveInstance(Number.NaN)).toBe(false);
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
    expect(formatWebWindowTitleWithUnreadCount(2, "Workspace", "#general | release")).toBe(
      "(2) #general | release - Workspace",
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
      "#general | release",
    );
    expect(buildActiveChatWindowTitle({ streamName: "general" })).toBe("#general");
    expect(buildActiveChatWindowTitle({ streamName: "   ", topicName: "release" })).toBeNull();
  });

  it("hasPersonalUnreadIndicator is true for personal DM or mentions unread", () => {
    expect(hasPersonalUnreadIndicator(0, 0)).toBe(false);
    expect(hasPersonalUnreadIndicator(2, 0)).toBe(true);
    expect(hasPersonalUnreadIndicator(0, 1)).toBe(true);
    expect(hasPersonalUnreadIndicator(1, 3)).toBe(true);
  });
});
