import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { fetchUnreadMentionsPage } from "~/shared/api/zulip-messages";
import { ensureMentionsUnreadSynced } from "./chat-list-mentions-sync.lib";

vi.mock("~/shared/api/zulip-messages", () => ({
  fetchUnreadMentionsPage: vi.fn(),
  MENTIONS_UNREAD_SYNC_PAGE_SIZE: 200,
}));

describe("ensureMentionsUnreadSynced", () => {
  beforeEach(() => {
    useChatListStore.getState().clear();
    useChatListStore.setState({ currentUserId: 7 });
    vi.mocked(fetchUnreadMentionsPage).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reconciles mention count from API page", async () => {
    vi.mocked(fetchUnreadMentionsPage).mockResolvedValue({
      messages: [
        {
          id: 1,
          sender_id: 10,
          sender_full_name: "Alice",
          content: "hi",
          timestamp: 1,
          stream_id: 5,
          subject: "general",
          display_recipient: "general",
          flags: ["mentioned"],
        },
        {
          id: 2,
          sender_id: 7,
          sender_full_name: "Me",
          content: "self",
          timestamp: 2,
          stream_id: 5,
          subject: "general",
          display_recipient: "general",
          flags: ["mentioned"],
        },
      ],
      foundOldest: true,
      foundNewest: true,
    });

    await ensureMentionsUnreadSynced({
      currentInstanceId: "inst-1",
      currentUserId: 7,
      forceRefresh: true,
    });

    expect(fetchUnreadMentionsPage).toHaveBeenCalledWith(200);
    expect(useChatListStore.getState().mentionsUnreadCount).toBe(1);
    expect(useChatListStore.getState().mentionsUnreadApiSynced).toBe(true);
    expect([...useChatListStore.getState().mentionedUnreadMessageIds]).toEqual([1]);
  });

  it("skips fetch when already api-synced unless forced", async () => {
    useChatListStore.setState({
      mentionsUnreadApiSynced: true,
      mentionsUnreadCount: 2,
      mentionedUnreadMessageIds: new Set([1, 2]),
    });

    await ensureMentionsUnreadSynced({
      currentInstanceId: "inst-1",
      currentUserId: 7,
    });

    expect(fetchUnreadMentionsPage).not.toHaveBeenCalled();
  });
});
