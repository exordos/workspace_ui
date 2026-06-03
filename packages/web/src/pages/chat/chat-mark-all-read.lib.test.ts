import { describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
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

function expectTarget(
  actual: MarkAllAsReadTarget | null,
  expected: MarkAllAsReadTarget | null,
): void {
  expect(actual).toEqual(expected);
}

describe("chat-mark-all-read", () => {
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
    useChatListStore.getState().clear();
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
    useChatListStore.getState().clear();
    const applyOptimistic = vi.fn();
    const target: MarkAllAsReadTarget = { type: "topic", streamId: 5, topic: "bugs" };
    await applyOpenChatMarkAllAsRead({
      target,
      loadedMessages: [{ id: 10, flags: [] }],
      currentUserId: 1,
      applyOptimistic,
    });
    expect(markMessagesAsRead).toHaveBeenCalledWith([10]);
    expect(applyOptimistic).toHaveBeenCalledWith([10], {
      type: "stream",
      streamId: 5,
      topic: "bugs",
    });
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
