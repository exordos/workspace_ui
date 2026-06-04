import { describe, expect, it } from "vitest";
import { buildUnreadReconcileMapsFromRegisterSnapshot } from "./chat-list-unread-reconcile.lib";

describe("buildUnreadReconcileMapsFromRegisterSnapshot", () => {
  it("builds stream topic and dm unread maps with message locations", () => {
    const maps = buildUnreadReconcileMapsFromRegisterSnapshot(
      {
        streams: [{ streamId: 5, topic: "general", unreadMessageIds: [101, 102] }],
        dms: [{ userIds: [10, 20], unreadMessageIds: [201] }],
        totalCount: 3,
        mentionMessageIds: [],
      },
      10,
    );

    expect(maps.unreadStreamCounts.get("5\tgeneral")).toBe(2);
    expect(maps.unreadDmCounts.get("10,20")).toBe(1);
    expect(maps.unreadLocationMap.get(101)).toEqual({
      type: "stream",
      stream_id: 5,
      topic: "general",
    });
    expect(maps.unreadLocationMap.get(201)?.type).toBe("dm");
  });

  it("returns empty maps for empty snapshot", () => {
    const maps = buildUnreadReconcileMapsFromRegisterSnapshot(
      {
        streams: [],
        dms: [],
        totalCount: 0,
        mentionMessageIds: [],
      },
      10,
    );

    expect(maps.unreadStreamCounts.size).toBe(0);
    expect(maps.unreadDmCounts.size).toBe(0);
    expect(maps.unreadLocationMap.size).toBe(0);
  });
});
