import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import * as client from "~/shared/api/client";
import type { MockMessage } from "~/shared/api/zulip.types";
import { handleLayoutZulipEventLoopQueueEvent } from "./layout-zulip-event-loop-on-event.lib";

vi.mock("~/shared/lib/notifications", () => ({
  notificationService: {
    show: vi.fn().mockResolvedValue(undefined),
    closeByTag: vi.fn().mockResolvedValue(undefined),
  },
}));

function mockMsg(id: number, overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id,
    sender_id: 99,
    sender_full_name: "Alice",
    stream_id: null,
    subject: "",
    content: "hi",
    timestamp: id,
    flags: [],
    ...overrides,
  };
}

describe("handleLayoutZulipEventLoopQueueEvent", () => {
  let getInstanceSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getInstanceSpy = vi.spyOn(client, "getCurrentInstance").mockReturnValue(null);
  });

  afterEach(() => {
    getInstanceSpy.mockRestore();
    useChatListStore.getState().clear();
    useCurrentChatMessagesStore.setState({
      context: null,
      messages: [],
      pendingOutgoingEchoKeys: [],
      isLoadingNewer: false,
    });
  });

  it("syncs read flags to message store from queue event", () => {
    useCurrentChatMessagesStore.getState().setMessages([mockMsg(55, { flags: [] })]);

    handleLayoutZulipEventLoopQueueEvent(
      {
        id: 1,
        type: "update_message_flags",
        op: "add",
        flag: "read",
        messages: [55],
      },
      { currentInstanceId: "inst-1", latestMessageIdRef: { current: null } },
    );

    expect(useCurrentChatMessagesStore.getState().messages[0]!.flags).toContain("read");
  });

  it("clears sidebar unread on markAllRead queue event", () => {
    useChatListStore.getState().setCurrentUserId(10);
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);
    useChatListStore.getState().reconcileUnreadFromSnapshot(
      {
        streams: [{ streamId: 5, topic: "topic1", unreadMessageIds: [1, 2] }],
        dms: [],
        totalCount: 2,
        mentionMessageIds: [],
      },
      10,
    );

    handleLayoutZulipEventLoopQueueEvent(
      {
        id: 2,
        type: "update_message_flags",
        op: "add",
        flag: "read",
        all: true,
        messages: [],
      },
      { currentInstanceId: "inst-1", latestMessageIdRef: { current: null } },
    );

    expect(useChatListStore.getState().sidebarStreamsUnread).toBe(0);
  });
});
