import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import { applySidebarMarkChatAsRead } from "./sidebar-mark-chat-read.lib";

const markDmAsReadMock = vi.fn();
const markStreamAsReadMock = vi.fn();
const markTopicAsReadMock = vi.fn();
const STREAM_UUID = "11111111-1111-4111-8111-111111111111";

vi.mock("~/shared/api/messenger-read-state", () => ({
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

  it("marks DM as read through API", async () => {
    useChatListStore.getState().setCurrentUserId(10);
    markDmAsReadMock.mockResolvedValue(true);

    const ok = await applySidebarMarkChatAsRead({ type: "dm", userIds: [10, 20] });

    expect(ok).toBe(true);
    expect(markDmAsReadMock).toHaveBeenCalledWith([10, 20]);
  });

  it("marks topic as read through API", async () => {
    markTopicAsReadMock.mockResolvedValue(true);

    const ok = await applySidebarMarkChatAsRead({
      type: "topic",
      streamId: STREAM_UUID,
      topic: "alpha",
    });

    expect(ok).toBe(true);
    expect(markTopicAsReadMock).toHaveBeenCalledWith(STREAM_UUID, "alpha");
  });

  it("removes matching inbox entry after topic mark-as-read", async () => {
    useInboxStore.getState().setEntries([
      {
        key: `stream:${STREAM_UUID}:alpha`,
        streamId: STREAM_UUID,
        streamName: "general",
        topic: "alpha",
        senderId: null,
        senderName: null,
        dmSlug: null,
        unreadCount: 2,
        lastMessageTimestamp: 100,
        messageIds: [
          "00000000-0000-4000-8000-000000000010",
          "00000000-0000-4000-8000-000000000011",
        ],
      },
      {
        key: `stream:${STREAM_UUID}:beta`,
        streamId: STREAM_UUID,
        streamName: "general",
        topic: "beta",
        senderId: null,
        senderName: null,
        dmSlug: null,
        unreadCount: 1,
        lastMessageTimestamp: 90,
        messageIds: ["00000000-0000-4000-8000-000000000012"],
      },
    ]);
    markTopicAsReadMock.mockResolvedValue(true);

    await applySidebarMarkChatAsRead({
      type: "topic",
      streamId: STREAM_UUID,
      topic: "alpha",
    });

    expect(useInboxStore.getState().entries.map((e) => e.key)).toEqual([
      `stream:${STREAM_UUID}:beta`,
    ]);
  });
});
