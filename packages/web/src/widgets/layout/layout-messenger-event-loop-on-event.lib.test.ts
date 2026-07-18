import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useMailStore } from "~/entities/mail/mail.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useChatInfoStore } from "~/features/chat-info/chat-info.model";
import * as externalAccountRealtime from "~/features/external-accounts/external-account-realtime.lib";
import * as client from "~/shared/api/client";
import type { MockMessage } from "~/shared/api/messenger.types";
import type { WorkspaceEvent, WorkspaceEventObjectType } from "~/shared/types/workspace-event";
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

function workspaceEvent(
  epochVersion: number,
  objectType: WorkspaceEventObjectType,
  action: string,
  payload: Record<string, unknown> & { kind: string },
): WorkspaceEvent {
  return {
    schema_version: 1,
    uuid: `event-${epochVersion}`,
    epoch_version: epochVersion,
    project_id: "project-1",
    user_uuid: "user-1",
    object_type: objectType,
    action,
    created_at: "2026-07-15T10:00:00Z",
    updated_at: "2026-07-15T10:00:00Z",
    payload,
  };
}

describe("handleLayoutMessengerEventLoopQueueEvent", () => {
  beforeEach(() => {
    vi.spyOn(client, "getCurrentInstance").mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
      workspaceEvent(2, "stream", "updated", {
        kind: "stream.updated",
        uuid: STREAM_UUID,
        description: "Updated from realtime",
      }),
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
      workspaceEvent(1, "message", "read", {
        kind: "messages.read",
        message_uuids: [testMessageId(55)],
      }),
      { currentInstanceId: "inst-1", latestMessageIdRef: { current: null } },
    );

    expect(useCurrentChatMessagesStore.getState().messages[0]!.flags).toContain("read");
  });

  it("syncs read flags to message store from Workspace messages.read events", () => {
    useCurrentChatMessagesStore.getState().setMessages([mockMsg(56, { flags: [], read: false })]);

    handleLayoutMessengerEventLoopQueueEvent(
      workspaceEvent(2, "message", "read", {
        kind: "messages.read",
        message_uuids: [testMessageId(56)],
      }),
      { currentInstanceId: "inst-1", latestMessageIdRef: { current: null } },
    );

    const message = useCurrentChatMessagesStore.getState().messages[0]!;
    expect(message.flags).toContain("read");
    expect(message.read).toBe(true);
  });

  it("routes backend mail object types to the mail projection", () => {
    const applyWorkspaceEvent = vi
      .spyOn(useMailStore.getState(), "applyWorkspaceEvent")
      .mockReturnValue(true);
    const event = workspaceEvent(3, "mail_message", "updated", {
      kind: "mail.message.updated",
      uuid: "message-1",
    });

    handleLayoutMessengerEventLoopQueueEvent(event, {
      currentInstanceId: "inst-1",
      latestMessageIdRef: { current: null },
    });

    expect(applyWorkspaceEvent).toHaveBeenCalledWith(event);
  });

  it("publishes backend external-account updates for the settings UI", () => {
    const publishExternalAccountUpdated = vi
      .spyOn(externalAccountRealtime, "publishExternalAccountUpdated")
      .mockImplementation(() => undefined);
    const event = workspaceEvent(4, "external_account", "updated", {
      kind: "external_account.updated",
      account_type: "zulip",
    });

    handleLayoutMessengerEventLoopQueueEvent(event, {
      currentInstanceId: "inst-1",
      latestMessageIdRef: { current: null },
    });

    expect(publishExternalAccountUpdated).toHaveBeenCalledWith(event.payload);
  });

  it.each(["external_chat", "external_operation"] as const)(
    "publishes backend %s updates for the external account UI",
    (objectType) => {
      const publishExternalAccountUpdated = vi
        .spyOn(externalAccountRealtime, "publishExternalAccountUpdated")
        .mockImplementation(() => undefined);
      const event = workspaceEvent(5, objectType, "updated", {
        kind: `${objectType}.updated`,
        uuid: `${objectType}-1`,
      });

      handleLayoutMessengerEventLoopQueueEvent(event, {
        currentInstanceId: "inst-1",
        latestMessageIdRef: { current: null },
      });

      expect(publishExternalAccountUpdated).toHaveBeenCalledWith(event.payload);
    },
  );
});
