import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import { applySidebarMarkChatAsRead } from "./sidebar-mark-chat-read.lib";

const markDmAsReadMock = vi.fn();
const markStreamAsReadMock = vi.fn();
const markTopicAsReadMock = vi.fn();

vi.mock("~/shared/api/zulip-read-state", () => ({
  markDmAsRead: (...args: unknown[]) => markDmAsReadMock(...args),
  markStreamAsRead: (...args: unknown[]) => markStreamAsReadMock(...args),
  markTopicAsRead: (...args: unknown[]) => markTopicAsReadMock(...args),
}));

describe("applySidebarMarkChatAsRead", () => {
  afterEach(() => {
    useChatListStore.getState().clear();
    useInboxStore.getState().clear();
    markDmAsReadMock.mockReset();
    markStreamAsReadMock.mockReset();
    markTopicAsReadMock.mockReset();
  });

  it("clears DM unread after successful narrow API", async () => {
    useChatListStore.getState().setCurrentUserId(10);
    useChatListStore.getState().upsertDmMetadataRows([{ userIds: [10, 20], lastMessageId: 1 }]);
    useChatListStore.getState().reconcileUnreadFromSnapshot(
      {
        streams: [],
        dms: [{ userIds: [20], unreadMessageIds: [1, 2], isGroup: false }],
        totalCount: 2,
        mentionMessageIds: [],
      },
      10,
    );
    markDmAsReadMock.mockResolvedValue(true);

    const ok = await applySidebarMarkChatAsRead({ type: "dm", userIds: [10, 20] });

    expect(ok).toBe(true);
    expect(markDmAsReadMock).toHaveBeenCalledWith([10, 20]);
    expect(useChatListStore.getState().dmsMap.get("10,20")?.unreadCount).toBe(0);
  });

  it("clears topic unread after successful narrow API", async () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);
    useChatListStore.getState().reconcileUnreadFromSnapshot(
      {
        streams: [{ streamId: 5, topic: "alpha", unreadMessageIds: [10, 11] }],
        dms: [],
        totalCount: 2,
        mentionMessageIds: [],
      },
      1,
    );
    markTopicAsReadMock.mockResolvedValue(true);

    const ok = await applySidebarMarkChatAsRead({
      type: "topic",
      streamId: 5,
      topic: "alpha",
    });

    expect(ok).toBe(true);
    expect(markTopicAsReadMock).toHaveBeenCalledWith(5, "alpha");
    expect(useChatListStore.getState().streamsMap.get(5)?.topics.get("alpha")?.unreadCount).toBe(0);
  });

  it("removes matching inbox entry after topic mark-as-read", async () => {
    useInboxStore.getState().setEntries([
      {
        key: "stream:5:alpha",
        streamId: 5,
        streamName: "general",
        topic: "alpha",
        senderId: null,
        senderName: null,
        dmSlug: null,
        unreadCount: 2,
        lastMessageTimestamp: 100,
        messageIds: [10, 11],
      },
      {
        key: "stream:5:beta",
        streamId: 5,
        streamName: "general",
        topic: "beta",
        senderId: null,
        senderName: null,
        dmSlug: null,
        unreadCount: 1,
        lastMessageTimestamp: 90,
        messageIds: [12],
      },
    ]);
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);
    useChatListStore.getState().reconcileUnreadFromSnapshot(
      {
        streams: [{ streamId: 5, topic: "alpha", unreadMessageIds: [10, 11] }],
        dms: [],
        totalCount: 2,
        mentionMessageIds: [],
      },
      1,
    );
    markTopicAsReadMock.mockResolvedValue(true);

    await applySidebarMarkChatAsRead({
      type: "topic",
      streamId: 5,
      topic: "alpha",
    });

    expect(useInboxStore.getState().entries.map((e) => e.key)).toEqual(["stream:5:beta"]);
  });
});
