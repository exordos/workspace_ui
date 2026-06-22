import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { markMessagesAsRead } from "~/shared/api/messenger-read-state";
import { testMessageId } from "~/test/factories";
import {
  applyOpenChatMarkAllAsRead,
  collectMarkAllAsReadMessageIds,
  collectUnreadMessageIds,
  filterMessageIdsStillUnreadForOptimisticApply,
  resolveMarkAllAsReadTarget,
  type MarkAllAsReadTarget,
} from "./chat-mark-all-read.lib";

vi.mock("~/shared/api/messenger-read-state", () => ({
  markMessagesAsRead: vi.fn().mockResolvedValue(undefined),
}));

const STREAM_UUID = "11111111-1111-4111-8111-111111111111";

function resetStores(): void {
  useChatListStore.getState().clear();
  vi.mocked(markMessagesAsRead).mockClear();
  vi.mocked(markMessagesAsRead).mockResolvedValue(undefined);
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
        activeStreamId: STREAM_UUID,
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
        activeStreamId: STREAM_UUID,
        activeTopic: "incident",
      }),
      { type: "topic", streamId: STREAM_UUID, topic: "incident" },
    );
  });

  it("collects unread ids from loaded messages", () => {
    expect(
      collectUnreadMessageIds([
        { id: "00000000-0000-4000-8000-000000000001", read: true },
        { id: "00000000-0000-4000-8000-000000000002", read: false },
        { id: "00000000-0000-4000-8000-000000000003" },
      ]),
    ).toEqual([testMessageId(2), testMessageId(3)]);
  });

  it("collectMarkAllAsReadMessageIds merges loaded and index ids", () => {
    useChatListStore.setState({
      messageIdToLocation: new Map([
        [
          "00000000-0000-4000-8000-000000000099",
          { type: "stream", streamUuid: STREAM_UUID, topic: "incident" },
        ],
      ]),
    });
    const target: MarkAllAsReadTarget = { type: "topic", streamId: STREAM_UUID, topic: "incident" };
    expect(
      collectMarkAllAsReadMessageIds(
        [
          { id: "00000000-0000-4000-8000-000000000001", read: false },
          { id: "00000000-0000-4000-8000-000000000002", read: true },
        ],
        useChatListStore.getState().messageIdToLocation,
        target,
        7,
      ),
    ).toEqual([testMessageId(1), testMessageId(99)]);
  });

  it("applyOpenChatMarkAllAsRead uses per-id flags API", async () => {
    const applyOptimistic = vi.fn();
    const target: MarkAllAsReadTarget = { type: "topic", streamId: STREAM_UUID, topic: "bugs" };
    await applyOpenChatMarkAllAsRead({
      target,
      loadedMessages: [{ id: "00000000-0000-4000-8000-000000000010", read: false }],
      currentUserId: 1,
      applyOptimistic,
    });
    expect(markMessagesAsRead).toHaveBeenCalledWith([testMessageId(10)]);
    expect(applyOptimistic).toHaveBeenCalledWith([testMessageId(10)], {
      type: "stream",
      streamId: STREAM_UUID,
      topic: "bugs",
    });
  });

  describe("filterMessageIdsStillUnreadForOptimisticApply", () => {
    it("uses store messages when present", () => {
      expect(
        filterMessageIdsStillUnreadForOptimisticApply([testMessageId(1), testMessageId(2)], {
          storeMessages: [
            { id: "00000000-0000-4000-8000-000000000001", read: false },
            { id: "00000000-0000-4000-8000-000000000002", read: true },
          ],
          effectiveMessages: [{ id: "00000000-0000-4000-8000-000000000001", read: true }],
        }),
      ).toEqual([testMessageId(1)]);
    });

    it("falls back to effective list when id is missing from store (IDB vs store divergence)", () => {
      expect(
        filterMessageIdsStillUnreadForOptimisticApply([testMessageId(10), testMessageId(11)], {
          storeMessages: [{ id: "00000000-0000-4000-8000-000000000010", read: false }],
          effectiveMessages: [
            { id: "00000000-0000-4000-8000-000000000010", read: false },
            { id: "00000000-0000-4000-8000-000000000011", read: false },
          ],
        }),
      ).toEqual([testMessageId(10), testMessageId(11)]);
    });

    it("returns empty when store is empty but effective has no matching unread ids", () => {
      expect(
        filterMessageIdsStillUnreadForOptimisticApply([testMessageId(99)], {
          storeMessages: [],
          effectiveMessages: [{ id: "00000000-0000-4000-8000-000000000099", read: true }],
        }),
      ).toEqual([]);
    });

    it("prefers store row over effective when both contain the same id", () => {
      expect(
        filterMessageIdsStillUnreadForOptimisticApply([testMessageId(5)], {
          storeMessages: [{ id: "00000000-0000-4000-8000-000000000005", read: true }],
          effectiveMessages: [{ id: "00000000-0000-4000-8000-000000000005", read: false }],
        }),
      ).toEqual([]);
    });
  });
});
