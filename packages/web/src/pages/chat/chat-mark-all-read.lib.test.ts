import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { syncUnreadSurfacesFromDelta } from "~/entities/unread-sync/unread-surfaces-sync.lib";
import { markMessagesAsRead } from "~/shared/api/zulip-read-state";
import {
  applyOpenChatMarkAllAsRead,
  collectMarkAllAsReadMessageIds,
  collectUnreadMessageIds,
  filterMessageIdsStillUnreadForOptimisticApply,
  resolveMarkAllAsReadTarget,
  type MarkAllAsReadTarget,
} from "./chat-mark-all-read.lib";

vi.mock("~/shared/api/zulip-read-state", () => ({
  markMessagesAsRead: vi.fn().mockResolvedValue(undefined),
}));

const INSTANCE_ID = "chat-mark-all-read-test";

function resetStores(): void {
  useChatListStore.getState().clear();
  useInstancesStore.setState({
    instances: [
      {
        id: INSTANCE_ID,
        realm: "https://zulip.example.com",
        email: "user@example.com",
        apiKey: "api-key",
      },
    ],
    currentInstanceId: INSTANCE_ID,
    unreadCountsByInstance: {},
    dmUnreadCountsByInstance: {},
    activeOrgEpoch: 0,
  });
  vi.mocked(markMessagesAsRead).mockClear();
  vi.mocked(markMessagesAsRead).mockResolvedValue(undefined);
}

function applyUnreadDelta(source: "local-chat-mark-all-read", applyDelta: () => void): void {
  syncUnreadSurfacesFromDelta({
    source,
    instanceId: INSTANCE_ID,
    applyDelta,
  });
}

function expectTarget(
  actual: MarkAllAsReadTarget | null,
  expected: MarkAllAsReadTarget | null,
): void {
  expect(actual).toEqual(expected);
}

describe("chat-mark-all-read", () => {
  beforeEach(() => {
    resetStores();
  });

  it("returns dm target for DM chat with valid participants", () => {
    expectTarget(
      resolveMarkAllAsReadTarget({
        isDmView: true,
        activeDmUserIds: [42, 7],
        activeStreamId: null,
        activeTopic: undefined,
      }),
      { type: "dm", userIds: [42, 7] },
    );
  });

  it("returns null for DM chat without participants", () => {
    expectTarget(
      resolveMarkAllAsReadTarget({
        isDmView: true,
        activeDmUserIds: [],
        activeStreamId: null,
        activeTopic: undefined,
      }),
      null,
    );
  });

  it("returns null for stream-wide chat (no topic in route)", () => {
    expectTarget(
      resolveMarkAllAsReadTarget({
        isDmView: false,
        activeDmUserIds: null,
        activeStreamId: 10,
        activeTopic: undefined,
      }),
      null,
    );
  });

  it("returns topic target for stream topic route", () => {
    expectTarget(
      resolveMarkAllAsReadTarget({
        isDmView: false,
        activeDmUserIds: null,
        activeStreamId: 10,
        activeTopic: "incident",
      }),
      { type: "topic", streamId: 10, topic: "incident" },
    );
  });

  it("collects unread ids from loaded messages", () => {
    expect(
      collectUnreadMessageIds([
        { id: 1, flags: ["read"] },
        { id: 2, flags: ["starred"] },
        { id: 3, flags: undefined },
      ]),
    ).toEqual([2, 3]);
  });

  it("collectMarkAllAsReadMessageIds merges loaded and index ids", () => {
    useChatListStore.setState({
      messageIdToLocation: new Map([[99, { type: "stream", stream_id: 10, topic: "incident" }]]),
    });
    const target: MarkAllAsReadTarget = { type: "topic", streamId: 10, topic: "incident" };
    expect(
      collectMarkAllAsReadMessageIds(
        [
          { id: 1, flags: [] },
          { id: 2, flags: ["read"] },
        ],
        useChatListStore.getState().messageIdToLocation,
        target,
        7,
      ),
    ).toEqual([1, 99]);
  });

  it("applyOpenChatMarkAllAsRead uses per-id flags API", async () => {
    const applyOptimistic = vi.fn();
    const target: MarkAllAsReadTarget = { type: "topic", streamId: 5, topic: "bugs" };
    await applyOpenChatMarkAllAsRead({
      target,
      loadedMessages: [{ id: 10, flags: [] }],
      currentUserId: 1,
      applyOptimistic,
      applyUnreadDelta,
    });
    expect(markMessagesAsRead).toHaveBeenCalledWith([10]);
    expect(applyOptimistic).toHaveBeenCalledWith([10], {
      type: "stream",
      streamId: 5,
      topic: "bugs",
    });
  });

  it("syncs organization count when mark-all only clears remaining context unread", async () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "Engineering" }]);
    useChatListStore.getState().reconcileUnreadFromSnapshot(
      {
        streams: [{ streamId: 5, topic: "bugs", unreadMessageIds: [10, 11] }],
        dms: [],
        totalCount: 2,
        mentionMessageIds: [],
      },
      1,
    );
    useChatListStore.setState({ messageIdToLocation: new Map() });
    useInstancesStore.getState().setInstanceUnreadCount(INSTANCE_ID, 2);

    await applyOpenChatMarkAllAsRead({
      target: { type: "topic", streamId: 5, topic: "bugs" },
      loadedMessages: [],
      currentUserId: 1,
      applyOptimistic: vi.fn(),
      applyUnreadDelta,
    });

    expect(markMessagesAsRead).not.toHaveBeenCalled();
    expect(useChatListStore.getState().streamsMap.get(5)?.topics.get("bugs")?.unreadCount).toBe(0);
    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(0);
  });

  it("syncs organization count after mark-all clears unread outside loaded/index ids", async () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "Engineering" }]);
    useChatListStore.getState().reconcileUnreadFromSnapshot(
      {
        streams: [{ streamId: 5, topic: "bugs", unreadMessageIds: [10, 11] }],
        dms: [],
        totalCount: 2,
        mentionMessageIds: [],
      },
      1,
    );
    useChatListStore.setState({
      messageIdToLocation: new Map([[10, { type: "stream", stream_id: 5, topic: "bugs" }]]),
    });
    useInstancesStore.getState().setInstanceUnreadCount(INSTANCE_ID, 2);

    await applyOpenChatMarkAllAsRead({
      target: { type: "topic", streamId: 5, topic: "bugs" },
      loadedMessages: [{ id: 10, flags: [] }],
      currentUserId: 1,
      applyOptimistic: (messageIds) => {
        useChatListStore.getState().decrementUnreadForMessages(messageIds);
      },
      applyUnreadDelta,
    });

    expect(markMessagesAsRead).toHaveBeenCalledWith([10]);
    expect(useChatListStore.getState().streamsMap.get(5)?.topics.get("bugs")?.unreadCount).toBe(0);
    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(0);
  });

  describe("filterMessageIdsStillUnreadForOptimisticApply", () => {
    it("uses store messages when present", () => {
      expect(
        filterMessageIdsStillUnreadForOptimisticApply([1, 2], {
          storeMessages: [
            { id: 1, flags: [] },
            { id: 2, flags: ["read"] },
          ],
          effectiveMessages: [{ id: 1, flags: ["read"] }],
        }),
      ).toEqual([1]);
    });

    it("falls back to effective list when id is missing from store (IDB vs store divergence)", () => {
      expect(
        filterMessageIdsStillUnreadForOptimisticApply([10, 11], {
          storeMessages: [{ id: 10, flags: [] }],
          effectiveMessages: [
            { id: 10, flags: [] },
            { id: 11, flags: [] },
          ],
        }),
      ).toEqual([10, 11]);
    });

    it("returns empty when store is empty but effective has no matching unread ids", () => {
      expect(
        filterMessageIdsStillUnreadForOptimisticApply([99], {
          storeMessages: [],
          effectiveMessages: [{ id: 99, flags: ["read"] }],
        }),
      ).toEqual([]);
    });

    it("prefers store row over effective when both contain the same id", () => {
      expect(
        filterMessageIdsStillUnreadForOptimisticApply([5], {
          storeMessages: [{ id: 5, flags: ["read"] }],
          effectiveMessages: [{ id: 5, flags: [] }],
        }),
      ).toEqual([]);
    });
  });
});
