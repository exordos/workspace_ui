import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useChatInfoStore } from "~/features/chat-info/chat-info.model";
import * as client from "~/shared/api/client";
import type { MockMessage } from "~/shared/api/messenger.types";
import { testMessageId, testMessageOrdinal } from "~/test/factories";
import { handleLayoutMessengerEventLoopQueueEvent } from "./layout-messenger-event-loop-on-event.lib";

const STREAM_UUID = "00000000-0000-4000-8000-000000000042";

vi.mock("~/shared/lib/notifications", () => ({
  notificationService: {
    show: vi.fn().mockResolvedValue(undefined),
    closeByTag: vi.fn().mockResolvedValue(undefined),
  },
}));

function mockMsg(id: number | string, overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id: testMessageId(id),
    sender_id: 99,
    sender_full_name: "Alice",
    stream_uuid: null,
    subject: "",
    content: "hi",
    timestamp: testMessageOrdinal(id),
    flags: [],
    ...overrides,
  };
}

describe("handleLayoutMessengerEventLoopQueueEvent", () => {
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
    useChatInfoStore.getState().clear();
  });

  it("applies stream.updated description to active chat info", () => {
    useChatInfoStore.getState().setContext({
      kind: "stream",
      instanceId: "inst-1",
      streamUuid: STREAM_UUID,
      streamName: "engineering",
      isMuted: false,
      topics: [],
    });
    useChatInfoStore.getState().setData({
      type: "stream",
      name: "engineering",
      memberCount: 0,
      onlineCount: 0,
      members: [],
      description: "Initial description",
      topics: [],
      isMuted: false,
    });

    handleLayoutMessengerEventLoopQueueEvent(
      {
        id: 2,
        type: "stream",
        kind: "stream.updated",
        stream: {
          uuid: STREAM_UUID,
          description: "Updated from realtime",
        },
      },
      { currentInstanceId: "inst-1", latestMessageIdRef: { current: null } },
    );

    expect(useChatInfoStore.getState().data).toMatchObject({
      type: "stream",
      name: "engineering",
      description: "Updated from realtime",
    });
  });

  it("syncs read flags to message store from queue event", () => {
    useCurrentChatMessagesStore.getState().setMessages([mockMsg(55, { flags: [] })]);

    handleLayoutMessengerEventLoopQueueEvent(
      {
        id: 1,
        type: "update_message_flags",
        op: "add",
        flag: "read",
        messages: [testMessageId(55)],
      },
      { currentInstanceId: "inst-1", latestMessageIdRef: { current: null } },
    );

    expect(useCurrentChatMessagesStore.getState().messages[0]!.flags).toContain("read");
  });
});
