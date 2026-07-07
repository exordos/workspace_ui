import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import type { InboxEntry } from "~/entities/inbox/inbox.types";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import {
  removeUserStatusAwayPreference,
  writeUserStatusAwayPreference,
} from "~/entities/user/user-status-away-preference.lib";
import { useUsersStore } from "~/entities/user/user.model";
import * as client from "~/shared/api/client";
import type { MockMessage } from "~/shared/api/messenger.types";
import { testMessageId, testMessageOrdinal } from "~/test/factories";
import { dispatchMessengerEvent } from "./layout-messenger-event-dispatch.lib";
import type {
  LayoutCurrentChatActions,
  LayoutMessengerEventDispatchContext,
} from "./layout-messenger-event-dispatch.types";

const STREAM_UUID_10 = "00000000-0000-4000-8000-000000000010";
const STREAM_UUID_11 = "00000000-0000-4000-8000-000000000011";
const STREAM_UUID_16 = "00000000-0000-4000-8000-000000000016";
const STREAM_UUID_20 = "00000000-0000-4000-8000-000000000020";
const STREAM_UUID_42 = "00000000-0000-4000-8000-000000000042";
const TOPIC_UUID_7 = "00000000-0000-4000-8000-000000000007";
const USER_UUID_1 = "00000000-0000-4000-8000-000000000001";
const USER_UUID_2 = "00000000-0000-4000-8000-000000000002";
const USER_UUID_7 = "00000000-0000-4000-8000-000000000007";

function buildCtx(
  overrides: {
    updateMessageContentMock?: ReturnType<typeof vi.fn>;
    updateMessageLinkPreviewMock?: ReturnType<typeof vi.fn>;
    moveStreamTopicMock?: ReturnType<typeof vi.fn>;
    moveTopicToStreamMock?: ReturnType<typeof vi.fn>;
    moveStreamTopicMessagesMock?: ReturnType<typeof vi.fn>;
    moveTopicToStreamMessagesMock?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const noop = vi.fn();
  const updateMessageContentMock = overrides.updateMessageContentMock ?? vi.fn();
  const updateMessageLinkPreviewMock = overrides.updateMessageLinkPreviewMock ?? vi.fn();
  const moveStreamTopicMock = overrides.moveStreamTopicMock ?? vi.fn();
  const moveTopicToStreamMock = overrides.moveTopicToStreamMock ?? vi.fn();
  const moveStreamTopicMessagesMock = overrides.moveStreamTopicMessagesMock ?? vi.fn();
  const moveTopicToStreamMessagesMock = overrides.moveTopicToStreamMessagesMock ?? vi.fn();
  const ctx: LayoutMessengerEventDispatchContext = {
    currentInstanceId: "inst-1",
    chatList: {
      currentUserId: 1,
      streamsMap: new Map(),
      addMessage: noop,
      upsertStreamTopicShells: noop,
      upsertStreamMetadataRows: noop,
      renameStream: noop,
      moveStreamTopic:
        moveStreamTopicMock as LayoutMessengerEventDispatchContext["chatList"]["moveStreamTopic"],
      moveTopicToStream:
        moveTopicToStreamMock as LayoutMessengerEventDispatchContext["chatList"]["moveTopicToStream"],
      removeStreamTopic: noop,
      removeStream: noop,
      handleDeleteMessages: noop,
    },
    currentChat: {
      context: null,
      hasNewerMessages: false,
      appendMessage: noop,
      updateMessageFlags: noop,
      replaceMessageReactions: noop,
      removeMessages: noop,
      updateMessageContent:
        updateMessageContentMock as LayoutCurrentChatActions["updateMessageContent"],
      updateMessageLinkPreview:
        updateMessageLinkPreviewMock as LayoutCurrentChatActions["updateMessageLinkPreview"],
      moveStreamTopicMessages:
        moveStreamTopicMessagesMock as LayoutCurrentChatActions["moveStreamTopicMessages"],
      moveTopicToStreamMessages:
        moveTopicToStreamMessagesMock as LayoutCurrentChatActions["moveTopicToStreamMessages"],
    },
    users: {
      mergeUser: noop,
      mergeFromMessage: noop,
      setPresenceByEmail: noop,
      setStatus: noop,
    },
    typing: { setTyping: noop },
    mute: {
      isStreamMuted: () => false,
      isEffectivelyMuted: () => false,
      isTopicFollowed: () => false,
      getStreamNotificationMode: () => "all_messages",
      muteStream: noop,
      unmuteStream: noop,
      muteTopic: noop,
      unmuteTopic: noop,
      followTopic: noop,
      clearTopicVisibilityOverride: noop,
      setStreamNotificationMode: noop,
      setTopicNotificationMode: noop,
    },
    activity: {
      markStale: noop,
      markStarredSummaryStale: noop,
      applyStarredSummaryFlagEvent: noop,
    },
    inbox: { markStale: noop, clearEntries: noop },
    notifications: {
      show: vi.fn().mockResolvedValue(undefined),
      closeByTag: noop,
      playSound: noop,
      getSoundPreset: () => "none",
      requestAttentionIfNotFocused: noop,
    },
    jitsiCall: { ingestIncomingInvite: noop },
    updateLatestMessageId: noop,
  };
  return {
    ctx,
    updateMessageContentMock,
    updateMessageLinkPreviewMock,
    moveStreamTopicMock,
    moveTopicToStreamMock,
    moveStreamTopicMessagesMock,
    moveTopicToStreamMessagesMock,
  };
}

function buildIntegrationCtx(): LayoutMessengerEventDispatchContext {
  const noop = vi.fn();
  return {
    currentInstanceId: "inst-1",
    chatList: useChatListStore.getState(),
    currentChat: useCurrentChatMessagesStore.getState(),
    users: {
      mergeUser: noop,
      mergeFromMessage: noop,
      setPresenceByEmail: noop,
      setStatus: noop,
    },
    typing: { setTyping: noop },
    mute: {
      isStreamMuted: () => false,
      isEffectivelyMuted: () => false,
      isTopicFollowed: () => false,
      getStreamNotificationMode: () => "all_messages",
      muteStream: noop,
      unmuteStream: noop,
      muteTopic: noop,
      unmuteTopic: noop,
      followTopic: noop,
      clearTopicVisibilityOverride: noop,
      setStreamNotificationMode: noop,
      setTopicNotificationMode: noop,
    },
    activity: {
      markStale: noop,
      markStarredSummaryStale: noop,
      applyStarredSummaryFlagEvent: noop,
    },
    inbox: useInboxStore.getState(),
    notifications: {
      show: vi.fn().mockResolvedValue(undefined),
      closeByTag: noop,
      playSound: noop,
      getSoundPreset: () => "none",
      requestAttentionIfNotFocused: noop,
    },
    jitsiCall: { ingestIncomingInvite: noop },
    updateLatestMessageId: noop,
  };
}

function mockMsg(id: number | string, overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id: testMessageId(id),
    sender_id: 99,
    sender_full_name: "Alice",
    stream_uuid: null,
    subject: "",
    content: "hi",
    timestamp: testMessageOrdinal(testMessageOrdinal(id)),
    flags: [],
    ...overrides,
  };
}

function setCurrentInstanceForUnreadTests(): void {
  useInstancesStore.setState({
    instances: [
      {
        id: "inst-1",
        realm: "https://chat.example.com",
        login: "user@example.com",
        authType: "iam",
        iamAccessToken: "api-key",
      },
    ],
    currentInstanceId: "inst-1",
    unreadCountsByInstance: {},
    dmUnreadCountsByInstance: {},
    activeOrgEpoch: 0,
  });
}

describe("dispatchMessengerEvent", () => {
  let getInstanceSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    removeUserStatusAwayPreference(USER_UUID_1, "inst-1");
    getInstanceSpy = vi.spyOn(client, "getCurrentInstance").mockReturnValue(null);
  });

  afterEach(() => {
    removeUserStatusAwayPreference(USER_UUID_1, "inst-1");
    getInstanceSpy.mockRestore();
    useChatListStore.getState().clear();
    useInboxStore.getState().clear();
    useCurrentChatMessagesStore.setState({
      context: null,
      messages: [],
      pendingOutgoingEchoKeys: [],
      isLoadingNewer: false,
    });
    useUsersStore.getState().clear();
    useInstancesStore.setState({
      instances: [],
      currentInstanceId: null,
      unreadCountsByInstance: {},
      dmUnreadCountsByInstance: {},
      activeOrgEpoch: 0,
    });
  });

  describe("user", () => {
    it("merges Workspace user.updated profile events into users store actions", () => {
      const { ctx } = buildCtx();
      const mergeUserMock = vi.fn();
      ctx.users.mergeUser = mergeUserMock;
      const user = {
        user_id: USER_UUID_1,
        full_name: "Alice Admin",
        email: "alice@example.com",
        presence: { status: "do_not_disturb" as const, timestamp: 1_788_000_000 },
      };

      dispatchMessengerEvent(
        {
          id: 1,
          type: "user",
          kind: "user.updated",
          user,
        },
        ctx,
      );

      expect(mergeUserMock).toHaveBeenCalledWith(user);
    });

    it("keeps current user's local away intent over Workspace user.updated presence", () => {
      const { ctx } = buildCtx();
      const mergeUserMock = vi.fn();
      ctx.chatList.currentUserId = USER_UUID_1;
      ctx.users.mergeUser = mergeUserMock;
      writeUserStatusAwayPreference(USER_UUID_1, "inst-1", true);
      const user = {
        user_id: USER_UUID_1,
        full_name: "Alice Admin",
        email: "alice@example.com",
        status: { text: "Focusing", emojiName: "coffee", away: false },
        presence: { status: "offline" as const, timestamp: 1_788_000_000 },
      };

      dispatchMessengerEvent(
        {
          id: 1,
          type: "user",
          kind: "user.updated",
          user,
        },
        ctx,
      );

      expect(mergeUserMock).toHaveBeenCalledWith({
        ...user,
        status: { text: "Focusing", emojiName: "coffee", away: true },
      });
    });
  });

  describe("realm", () => {
    it("updates message edit policy from realm update_dict event", () => {
      const { ctx } = buildCtx();
      dispatchMessengerEvent(
        {
          id: 1,
          type: "realm",
          op: "update_dict",
          data: {
            allow_message_editing: false,
            message_content_edit_limit_seconds: null,
          },
        },
        ctx,
      );

      expect(useUsersStore.getState().currentUserMessageEditPolicy).toEqual({
        allowMessageEditing: false,
        messageContentEditLimitSeconds: null,
      });
    });

    it("updates message edit policy from realm update event", () => {
      const { ctx } = buildCtx();
      dispatchMessengerEvent(
        {
          id: 1,
          type: "realm",
          op: "update",
          property: "allow_message_editing",
          value: false,
        },
        ctx,
      );

      expect(useUsersStore.getState().currentUserMessageEditPolicy).toEqual({
        allowMessageEditing: false,
      });
    });

    it("normalizes legacy zero message edit time limit from realm update events to null", () => {
      const { ctx } = buildCtx();
      dispatchMessengerEvent(
        {
          id: 1,
          type: "realm",
          op: "update",
          property: "message_content_edit_limit_seconds",
          value: 0,
        },
        ctx,
      );

      expect(useUsersStore.getState().currentUserMessageEditPolicy).toEqual({
        messageContentEditLimitSeconds: null,
      });
    });

    it("normalizes legacy zero message edit time limit from realm update_dict events to null", () => {
      const { ctx } = buildCtx();
      dispatchMessengerEvent(
        {
          id: 1,
          type: "realm",
          op: "update_dict",
          data: {
            message_content_edit_limit_seconds: 0,
          },
        },
        ctx,
      );

      expect(useUsersStore.getState().currentUserMessageEditPolicy).toEqual({
        messageContentEditLimitSeconds: null,
      });
    });

    it("ignores invalid message edit policy values from realm update_dict event", () => {
      useUsersStore.getState().setCurrentUserMessageEditPolicy({
        allowMessageEditing: true,
        messageContentEditLimitSeconds: 600,
      });
      const { ctx } = buildCtx();
      dispatchMessengerEvent(
        {
          id: 1,
          type: "realm",
          op: "update_dict",
          data: {
            allow_message_editing: "no",
            message_content_edit_limit_seconds: -1,
          },
        },
        ctx,
      );

      expect(useUsersStore.getState().currentUserMessageEditPolicy).toEqual({
        allowMessageEditing: true,
        messageContentEditLimitSeconds: 600,
      });
    });
  });

  describe("update_message", () => {
    it("stores markdown as message content when not rendering_only", () => {
      const { ctx, updateMessageContentMock } = buildCtx();
      dispatchMessengerEvent(
        {
          id: 1,
          type: "update_message",
          message_id: "00000000-0000-4000-8000-000000000042",
          rendered_content: "<p>new</p>",
          content: "*new*",
          rendering_only: false,
        },
        ctx,
      );
      expect(updateMessageContentMock).toHaveBeenCalledWith(testMessageId(42), "*new*", "*new*");
    });

    it("does not overwrite content when rendering_only", () => {
      const { ctx, updateMessageContentMock, updateMessageLinkPreviewMock, moveStreamTopicMock } =
        buildCtx();
      dispatchMessengerEvent(
        {
          id: 2,
          type: "update_message",
          message_id: "00000000-0000-4000-8000-000000000007",
          rendered_content: "<p>preview</p>",
          content: "same md",
          rendering_only: true,
        },
        ctx,
      );
      expect(updateMessageContentMock).not.toHaveBeenCalled();
      expect(updateMessageLinkPreviewMock).not.toHaveBeenCalled();
      expect(moveStreamTopicMock).not.toHaveBeenCalled();
    });

    it("buffers link preview when rendering_only arrives before message row exists", () => {
      const { ctx, updateMessageLinkPreviewMock } = buildCtx();
      useCurrentChatMessagesStore.setState({ messages: [] });
      dispatchMessengerEvent(
        {
          id: 5,
          type: "update_message",
          message_id: "00000000-0000-4000-8000-000000000009",
          rendering_only: true,
          rendered_content: `
            <div class="message_embed">
              <a class="message_embed_image" href="https://example.com"></a>
              <div class="data-container">
                <div class="message_embed_title"><a href="https://example.com">Example</a></div>
              </div>
            </div>`,
        },
        ctx,
      );
      expect(updateMessageLinkPreviewMock).not.toHaveBeenCalled();
      useCurrentChatMessagesStore.getState().appendMessage({
        id: "00000000-0000-4000-8000-000000000009",
        sender_id: 1,
        sender_full_name: "Alice",
        stream_uuid: "00000000-0000-4000-8000-000000000005",
        subject: "general",
        content: "https://example.com",
        timestamp: 1,
      });
      expect(useCurrentChatMessagesStore.getState().messages[0]!.link_previews?.[0]?.title).toBe(
        "Example",
      );
    });

    it("applies link preview from rendering_only rendered_content without changing markdown", () => {
      const { ctx, updateMessageContentMock, updateMessageLinkPreviewMock } = buildCtx();
      const message: MockMessage = {
        id: "00000000-0000-4000-8000-000000000009",
        sender_id: 1,
        sender_full_name: "Alice",
        stream_uuid: "00000000-0000-4000-8000-000000000005",
        subject: "general",
        content: "https://example.com",
        timestamp: 1,
      };
      useCurrentChatMessagesStore.setState({ messages: [message] });
      dispatchMessengerEvent(
        {
          id: 4,
          type: "update_message",
          message_id: "00000000-0000-4000-8000-000000000009",
          rendering_only: true,
          rendered_content: `
            <p><a href="https://example.com">https://example.com</a></p>
            <div class="message_embed">
              <a class="message_embed_image" href="https://example.com"></a>
              <div class="data-container">
                <div class="message_embed_title"><a href="https://example.com">Example</a></div>
                <div class="message_embed_description">Site description</div>
              </div>
            </div>`,
        },
        ctx,
      );
      expect(updateMessageContentMock).not.toHaveBeenCalled();
      expect(updateMessageLinkPreviewMock).toHaveBeenCalledWith(
        testMessageId(9),
        expect.objectContaining({
          targetUrl: "https://example.com",
          title: "Example",
          description: "Site description",
        }),
      );
    });

    it("moves stream topic in chat list when topic is renamed", () => {
      const { ctx, moveStreamTopicMock, moveStreamTopicMessagesMock } = buildCtx();
      dispatchMessengerEvent(
        {
          id: 3,
          type: "update_message",
          message_id: "00000000-0000-4000-8000-000000000099",
          stream_uuid: "00000000-0000-4000-8000-000000000042",
          orig_subject: "incident",
          subject: "\u2714 incident",
          message_ids: [
            "00000000-0000-4000-8000-000000000001",
            "00000000-0000-4000-8000-000000000002",
            "00000000-0000-4000-8000-000000000003",
          ],
        },
        ctx,
      );
      expect(moveStreamTopicMock).toHaveBeenCalledWith({
        streamId: "00000000-0000-4000-8000-000000000042",
        oldTopic: "incident",
        newTopic: "\u2714 incident",
        messageIds: [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
          "00000000-0000-4000-8000-000000000003",
        ],
        anchorMessageId: "00000000-0000-4000-8000-000000000099",
      });
      expect(moveStreamTopicMessagesMock).toHaveBeenCalledWith({
        streamId: "00000000-0000-4000-8000-000000000042",
        oldTopic: "incident",
        newTopic: "\u2714 incident",
        messageIds: [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
          "00000000-0000-4000-8000-000000000003",
        ],
        anchorMessageId: "00000000-0000-4000-8000-000000000099",
      });
    });

    it("moves stream topic to another channel when new_stream_uuid is present", () => {
      const {
        ctx,
        moveStreamTopicMock,
        moveTopicToStreamMock,
        moveStreamTopicMessagesMock,
        moveTopicToStreamMessagesMock,
      } = buildCtx({
        moveTopicToStreamMock: vi.fn(),
        moveTopicToStreamMessagesMock: vi.fn(),
      });
      ctx.chatList.streamsMap = new Map([
        [
          STREAM_UUID_20,
          {
            streamUuid: STREAM_UUID_20,
            name: "dev",
            lastMessage: "",
            time: "",
            ts: 0,
            topics: new Map(),
          },
        ],
      ]);
      dispatchMessengerEvent(
        {
          id: 4,
          type: "update_message",
          message_id: "00000000-0000-4000-8000-000000000099",
          stream_uuid: "00000000-0000-4000-8000-000000000010",
          new_stream_uuid: STREAM_UUID_20,
          orig_subject: "incident",
          subject: "incident",
          message_ids: [
            "00000000-0000-4000-8000-000000000001",
            "00000000-0000-4000-8000-000000000002",
          ],
        },
        ctx,
      );
      expect(moveTopicToStreamMock).toHaveBeenCalledWith({
        sourceStreamId: "00000000-0000-4000-8000-000000000010",
        targetStreamId: "00000000-0000-4000-8000-000000000020",
        oldTopic: "incident",
        newTopic: "incident",
        messageIds: [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
        ],
        anchorMessageId: "00000000-0000-4000-8000-000000000099",
      });
      expect(moveTopicToStreamMessagesMock).toHaveBeenCalledWith({
        sourceStreamId: "00000000-0000-4000-8000-000000000010",
        targetStreamId: "00000000-0000-4000-8000-000000000020",
        oldTopic: "incident",
        newTopic: "incident",
        messageIds: [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
        ],
        anchorMessageId: "00000000-0000-4000-8000-000000000099",
        targetStreamName: "dev",
      });
      expect(moveStreamTopicMock).not.toHaveBeenCalled();
      expect(moveStreamTopicMessagesMock).not.toHaveBeenCalled();
    });

    it("does not move topic when update_message lacks topic rename payload", () => {
      const { ctx, moveStreamTopicMock, moveStreamTopicMessagesMock } = buildCtx();
      dispatchMessengerEvent(
        {
          id: 4,
          type: "update_message",
          message_id: "00000000-0000-4000-8000-000000000007",
          stream_uuid: "00000000-0000-4000-8000-000000000042",
          subject: "incident",
        },
        ctx,
      );
      expect(moveStreamTopicMock).not.toHaveBeenCalled();
      expect(moveStreamTopicMessagesMock).not.toHaveBeenCalled();
    });

    it("keeps topic row after rename followed by delete_message of moved last id", () => {
      useChatListStore.getState().setFromMessages(
        [
          {
            id: "00000000-0000-4000-8000-000000000001",
            sender_id: 10,
            sender_full_name: "Alice",
            content: "first",
            timestamp: 1000,
            type: "stream",
            stream_uuid: "00000000-0000-4000-8000-000000000042",
            display_recipient: "engineering",
            subject: "incident",
            flags: [],
          },
        ],
        1,
      );
      const { ctx } = buildCtx();
      const realChatListState = useChatListStore.getState();
      const realStreamsMap = useChatListStore.getState().streamsMap;
      const integrationCtx: LayoutMessengerEventDispatchContext = {
        ...ctx,
        chatList: {
          ...ctx.chatList,
          streamsMap: realStreamsMap,
          moveStreamTopic: realChatListState.moveStreamTopic,
          handleDeleteMessages: realChatListState.handleDeleteMessages,
        },
      };

      dispatchMessengerEvent(
        {
          id: 10,
          type: "update_message",
          message_id: "00000000-0000-4000-8000-000000000001",
          stream_uuid: "00000000-0000-4000-8000-000000000042",
          orig_subject: "incident",
          subject: "\u2714 incident",
          message_ids: ["00000000-0000-4000-8000-000000000001"],
        },
        integrationCtx,
      );
      dispatchMessengerEvent(
        {
          id: 11,
          type: "delete_message",
          message_ids: ["00000000-0000-4000-8000-000000000001"],
        },
        integrationCtx,
      );

      const stream = useChatListStore.getState().streamsMap.get(STREAM_UUID_42);
      expect(stream?.topics.has("\u2714 incident")).toBe(true);
      expect(stream?.topics.get("\u2714 incident")?.lastMessageId).toBe(undefined);
    });
  });

  describe("topic", () => {
    it("upserts sidebar topic metadata on backend topic.updated", () => {
      const { ctx } = buildCtx();
      const upsertSpy = vi.spyOn(ctx.chatList, "upsertStreamTopicShells");
      const source = {
        kind: "zulip",
        server_url: "https://zulip.example",
        stream_id: 42,
        topic_name: "retros",
      };

      dispatchMessengerEvent(
        {
          id: 30,
          type: "topic",
          kind: "topic.updated",
          topic: {
            uuid: TOPIC_UUID_7,
            stream_uuid: STREAM_UUID_42,
            name: "retros",
            unread_count: 4,
            is_done: true,
            color: 0xabcdef,
            source_name: "zulip",
            source,
          },
        },
        ctx,
      );

      expect(upsertSpy).toHaveBeenCalledWith(STREAM_UUID_42, [
        {
          topicUuid: TOPIC_UUID_7,
          streamUuid: STREAM_UUID_42,
          name: "retros",
          unreadCount: 4,
          isDone: true,
          color: 0xabcdef,
          sourceName: "zulip",
          source,
        },
      ]);
    });

    it("removes sidebar topic metadata on backend topic.deleted", () => {
      const { ctx } = buildCtx();
      const removeSpy = vi.spyOn(ctx.chatList, "removeStreamTopic");
      const clearSpy = vi.spyOn(ctx.mute, "clearTopicVisibilityOverride");

      dispatchMessengerEvent(
        {
          id: 31,
          type: "topic",
          kind: "topic.deleted",
          topic: {
            uuid: TOPIC_UUID_7,
            stream_uuid: STREAM_UUID_42,
          },
        },
        ctx,
      );

      expect(removeSpy).toHaveBeenCalledWith(STREAM_UUID_42, TOPIC_UUID_7);
      expect(clearSpy).toHaveBeenCalledWith(STREAM_UUID_42, TOPIC_UUID_7);
    });

    it("updates topic notification mode on backend topic.updated", () => {
      const { ctx } = buildCtx();
      const modeSpy = vi.spyOn(ctx.mute, "setTopicNotificationMode");

      dispatchMessengerEvent(
        {
          id: 32,
          type: "topic",
          kind: "topic.updated",
          topic: {
            uuid: TOPIC_UUID_7,
            stream_uuid: STREAM_UUID_42,
            notification_mode: "follow",
          },
        },
        ctx,
      );

      expect(modeSpy).toHaveBeenCalledWith(STREAM_UUID_42, TOPIC_UUID_7, "follow");
    });

    it("upserts topic color-only updates using existing topic name", () => {
      const { ctx } = buildCtx();
      const upsertSpy = vi.spyOn(ctx.chatList, "upsertStreamTopicShells");
      ctx.chatList.streamsMap.set(STREAM_UUID_42, {
        streamUuid: STREAM_UUID_42,
        name: "engineering",
        lastMessage: "",
        time: "",
        ts: 0,
        topics: new Map([
          [
            "release",
            {
              topicUuid: TOPIC_UUID_7,
              subject: "release",
              lastMessage: "",
              time: "",
              ts: 0,
              unreadCount: 0,
            },
          ],
        ]),
      });

      dispatchMessengerEvent(
        {
          id: 33,
          type: "topic",
          kind: "topic.updated",
          topic: {
            uuid: TOPIC_UUID_7,
            stream_uuid: STREAM_UUID_42,
            color: 0x445566,
          },
        },
        ctx,
      );

      expect(upsertSpy).toHaveBeenCalledWith(STREAM_UUID_42, [
        {
          topicUuid: TOPIC_UUID_7,
          streamUuid: STREAM_UUID_42,
          name: "release",
          color: 0x445566,
        },
      ]);
    });
  });

  describe("subscription notification properties", () => {
    it("updates notification_mode on subscription update", () => {
      const { ctx } = buildCtx();
      const modeSpy = vi.spyOn(ctx.mute, "setStreamNotificationMode");

      dispatchMessengerEvent(
        {
          id: 90,
          type: "subscription",
          op: "update",
          stream_uuid: "00000000-0000-4000-8000-000000000042",
          property: "notification_mode",
          value: "mentions_only",
        },
        ctx,
      );

      expect(modeSpy).toHaveBeenCalledWith(STREAM_UUID_42, "mentions_only");
    });
  });

  describe("stream", () => {
    // Assert: backend stream.created must add channel metadata to the sidebar store.
    // Why: new channels must appear immediately even without new messages.
    it("upserts stream metadata on backend stream.created", () => {
      const { ctx } = buildCtx();
      const upsertSpy = vi.spyOn(ctx.chatList, "upsertStreamMetadataRows");

      dispatchMessengerEvent(
        {
          id: 18,
          type: "stream",
          kind: "stream.created",
          stream: {
            uuid: "00000000-0000-4000-8000-000000000042",
            name: "engineering",
            unread_count: 3,
            invite_only: true,
            private: false,
            is_archived: false,
            color: 0x123456,
          },
        },
        ctx,
      );

      expect(upsertSpy).toHaveBeenCalledWith([
        {
          streamUuid: "00000000-0000-4000-8000-000000000042",
          name: "engineering",
          unreadCount: 3,
          inviteOnly: true,
          private: false,
          isArchived: false,
          color: 0x123456,
        },
      ]);
    });

    it("applies description-only backend stream.updated to chat info", () => {
      const { ctx } = buildCtx();
      const upsertSpy = vi.spyOn(ctx.chatList, "upsertStreamMetadataRows");
      const applyStreamMetadataUpdate = vi.fn();
      ctx.chatInfo = { applyStreamMetadataUpdate };

      dispatchMessengerEvent(
        {
          id: 20,
          type: "stream",
          kind: "stream.updated",
          stream: {
            uuid: "00000000-0000-4000-8000-000000000042",
            description: "Only description changed",
          },
        },
        ctx,
      );

      expect(upsertSpy).not.toHaveBeenCalled();
      expect(applyStreamMetadataUpdate).toHaveBeenCalledWith({
        instanceId: "inst-1",
        streamUuid: "00000000-0000-4000-8000-000000000042",
        description: "Only description changed",
      });
    });

    it("upserts stream metadata on backend stream.updated", () => {
      const { ctx } = buildCtx();
      const upsertSpy = vi.spyOn(ctx.chatList, "upsertStreamMetadataRows");
      const applyStreamMetadataUpdate = vi.fn();
      ctx.chatInfo = { applyStreamMetadataUpdate };
      const source = {
        kind: "zulip",
        server_url: "https://zulip.example",
        stream_id: 42,
      };

      dispatchMessengerEvent(
        {
          id: 19,
          type: "stream",
          kind: "stream.updated",
          stream: {
            uuid: "00000000-0000-4000-8000-000000000042",
            name: "platform",
            description: "Platform discussions",
            unread_count: 3,
            invite_only: true,
            private: false,
            is_archived: true,
            color: 0x654321,
            source_name: "zulip",
            source,
          },
        },
        ctx,
      );

      expect(upsertSpy).toHaveBeenCalledWith([
        {
          streamUuid: "00000000-0000-4000-8000-000000000042",
          name: "platform",
          unreadCount: 3,
          inviteOnly: true,
          private: false,
          isArchived: true,
          color: 0x654321,
          sourceName: "zulip",
          source,
        },
      ]);
      expect(applyStreamMetadataUpdate).toHaveBeenCalledWith({
        instanceId: "inst-1",
        streamUuid: "00000000-0000-4000-8000-000000000042",
        name: "platform",
        description: "Platform discussions",
      });
    });

    it("updates notification mode on backend stream.updated", () => {
      const { ctx } = buildCtx();
      const modeSpy = vi.spyOn(ctx.mute, "setStreamNotificationMode");

      dispatchMessengerEvent(
        {
          id: 21,
          type: "stream",
          kind: "stream.updated",
          stream: {
            uuid: "00000000-0000-4000-8000-000000000042",
            notification_mode: "muted",
          },
        },
        ctx,
      );

      expect(modeSpy).toHaveBeenCalledWith(STREAM_UUID_42, "muted");
    });
  });

  describe("folder realtime", () => {
    it("applies folder.updated snapshots to folder sync", () => {
      const { ctx } = buildCtx();
      const applyRealtimeFolderSnapshot = vi.fn();
      ctx.folderSync = {
        applyRealtimeFolderSnapshot,
        applyRealtimeFolderDeleted: vi.fn(),
        applyRealtimeFolderItemDeleted: vi.fn(),
      };
      const folder = {
        uuid: "50ecadd0-9823-4d97-b54c-806cc672c210",
        title: "All",
        background_color_value: 0,
        system_type: "all",
        folder_items: [
          {
            uuid: "9f41b1a7-77f9-4c12-bdc6-d3cebc5dbf50",
            folder_uuid: "50ecadd0-9823-4d97-b54c-806cc672c210",
            stream_uuid: STREAM_UUID_42,
            chat_type: "stream",
            order_index: 0,
          },
        ],
      };

      dispatchMessengerEvent(
        {
          id: 92,
          type: "folder",
          kind: "folder.updated",
          folder,
        },
        ctx,
      );

      expect(applyRealtimeFolderSnapshot).toHaveBeenCalledWith(folder);
    });

    it("applies folder_item.deleted to folder sync", () => {
      const { ctx } = buildCtx();
      const applyRealtimeFolderItemDeleted = vi.fn();
      ctx.folderSync = {
        applyRealtimeFolderSnapshot: vi.fn(),
        applyRealtimeFolderDeleted: vi.fn(),
        applyRealtimeFolderItemDeleted,
      };

      dispatchMessengerEvent(
        {
          id: 93,
          type: "folder_item",
          kind: "folder_item.deleted",
          folder_item: { uuid: "9f41b1a7-77f9-4c12-bdc6-d3cebc5dbf50" },
        },
        ctx,
      );

      expect(applyRealtimeFolderItemDeleted).toHaveBeenCalledWith(
        "9f41b1a7-77f9-4c12-bdc6-d3cebc5dbf50",
      );
    });
  });

  describe("message stream rename fallback", () => {
    // Assert: fallback renames channel from message.display_recipient.
    // Why: message metadata can carry the newest stream name before sidebar metadata refresh.
    it("renames stream from message display_recipient when stream event is absent", () => {
      const { ctx } = buildCtx();
      const renameSpy = vi.spyOn(ctx.chatList, "renameStream");

      dispatchMessengerEvent(
        {
          id: 21,
          type: "message",
          flags: [],
          message: {
            id: "00000000-0000-4000-8000-000000001988",
            sender_id: 6,
            content: "rename notice",
            timestamp: 1777960620,
            type: "stream",
            stream_uuid: "00000000-0000-4000-8000-000000000016",
            display_recipient: "##КокоБомбони V2",
            subject: "события канала",
          },
        },
        ctx,
      );

      expect(renameSpy).toHaveBeenCalledWith(STREAM_UUID_16, "##КокоБомбони V2");
    });

    it("does not derive organization unread count from incoming unread message", () => {
      setCurrentInstanceForUnreadTests();
      useChatListStore.getState().setCurrentUserId(1);

      dispatchMessengerEvent(
        {
          id: 22,
          type: "message",
          flags: [],
          message: {
            id: "00000000-0000-4000-8000-000000001989",
            sender_id: 6,
            sender_full_name: "Alice",
            content: "new unread",
            timestamp: 1777960630,
            type: "stream",
            stream_uuid: "00000000-0000-4000-8000-000000000016",
            display_recipient: "engineering",
            subject: "events",
            flags: [],
          },
        },
        buildIntegrationCtx(),
      );

      expect(useChatListStore.getState().sidebarStreamsUnread).toBe(0);
      expect(useInstancesStore.getState().getInstanceUnreadCount("inst-1")).toBe(0);
    });

    it("leaves organization count server-owned after muted incoming unread message", () => {
      setCurrentInstanceForUnreadTests();
      useChatListStore.getState().setCurrentUserId(1);
      const ctx = buildIntegrationCtx();
      ctx.mute.isStreamMuted = (streamId) => streamId === STREAM_UUID_16;
      ctx.mute.isEffectivelyMuted = (streamId) => streamId === STREAM_UUID_16;

      dispatchMessengerEvent(
        {
          id: 23,
          type: "message",
          flags: [],
          message: {
            id: "00000000-0000-4000-8000-000000001990",
            sender_id: 6,
            sender_full_name: "Alice",
            content: "muted unread",
            timestamp: 1777960640,
            type: "stream",
            stream_uuid: "00000000-0000-4000-8000-000000000016",
            display_recipient: "engineering",
            subject: "muted",
            flags: [],
          },
        },
        ctx,
      );

      expect(useChatListStore.getState().sidebarStreamsUnread).toBe(0);
      expect(useInstancesStore.getState().getInstanceUnreadCount("inst-1")).toBe(0);
    });
  });

  describe("workspace message lifecycle events", () => {
    it("applies message.updated snapshots to the open chat and sidebar preview", () => {
      const { ctx, updateMessageContentMock } = buildCtx();
      ctx.chatList.addMessage = vi.fn();
      ctx.currentChat.appendMessage = vi.fn();
      ctx.notifications.closeByTag = vi.fn();
      ctx.currentChat.context = {
        type: "stream",
        streamId: STREAM_UUID_10,
        streamName: "engineering",
        topic: TOPIC_UUID_7,
        topicUuid: TOPIC_UUID_7,
        streamWideView: false,
      };
      const updateFlagsSpy = vi.spyOn(ctx.currentChat, "updateMessageFlags");
      const replaceReactionsSpy = vi.spyOn(ctx.currentChat, "replaceMessageReactions");

      dispatchMessengerEvent(
        {
          id: 31,
          type: "message",
          kind: "message.updated",
          message: {
            id: "00000000-0000-4000-8000-000000000031",
            sender_id: 0,
            author_uuid: USER_UUID_2,
            sender_uuid: USER_UUID_2,
            sender_full_name: "Alice",
            content: "edited body",
            markdown_source: "edited body",
            timestamp: 1777960650,
            type: "stream",
            stream_uuid: STREAM_UUID_10,
            topic_uuid: TOPIC_UUID_7,
            subject: TOPIC_UUID_7,
            read: true,
            pinned: false,
            starred: true,
            flags: ["read", "starred"],
            reactions: { thumbs_up: 2 },
          },
        },
        ctx,
      );

      expect(ctx.chatList.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: "00000000-0000-4000-8000-000000000031" }),
      );
      expect(updateMessageContentMock).toHaveBeenCalledWith(
        "00000000-0000-4000-8000-000000000031",
        "edited body",
        "edited body",
      );
      expect(updateFlagsSpy).toHaveBeenCalledWith(
        ["00000000-0000-4000-8000-000000000031"],
        "read",
        "add",
      );
      expect(updateFlagsSpy).toHaveBeenCalledWith(
        ["00000000-0000-4000-8000-000000000031"],
        "starred",
        "add",
      );
      expect(replaceReactionsSpy).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000031", {
        thumbs_up: 2,
      });
      expect(ctx.currentChat.appendMessage).not.toHaveBeenCalled();
    });

    it("applies message.read snapshots without treating them as new incoming messages", () => {
      const { ctx } = buildCtx();
      ctx.chatList.addMessage = vi.fn();
      ctx.currentChat.appendMessage = vi.fn();
      ctx.currentChat.updateMessageFlags = vi.fn();
      ctx.notifications.closeByTag = vi.fn();
      ctx.currentChat.context = {
        type: "stream",
        streamId: STREAM_UUID_10,
        streamName: "engineering",
        topic: TOPIC_UUID_7,
        topicUuid: TOPIC_UUID_7,
        streamWideView: false,
      };

      dispatchMessengerEvent(
        {
          id: 33,
          type: "message",
          kind: "message.read",
          message: {
            id: "00000000-0000-4000-8000-000000000033",
            sender_id: 0,
            author_uuid: USER_UUID_2,
            sender_uuid: USER_UUID_2,
            sender_full_name: "Alice",
            content: "read body",
            markdown_source: "read body",
            timestamp: 1777960655,
            type: "stream",
            stream_uuid: STREAM_UUID_10,
            topic_uuid: TOPIC_UUID_7,
            subject: TOPIC_UUID_7,
            read: true,
            pinned: false,
            starred: false,
            flags: ["read"],
          },
        },
        ctx,
      );

      expect(ctx.chatList.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: "00000000-0000-4000-8000-000000000033" }),
      );
      expect(ctx.currentChat.updateMessageFlags).toHaveBeenCalledWith(
        ["00000000-0000-4000-8000-000000000033"],
        "read",
        "add",
      );
      expect(ctx.notifications.closeByTag).toHaveBeenCalled();
      expect(ctx.currentChat.appendMessage).not.toHaveBeenCalled();
    });

    it("deletes messages from new message.deleted events", () => {
      const { ctx } = buildCtx();
      ctx.chatList.handleDeleteMessages = vi.fn();
      ctx.currentChat.appendMessage = vi.fn();
      ctx.currentChat.removeMessages = vi.fn();
      ctx.notifications.closeByTag = vi.fn();

      dispatchMessengerEvent(
        {
          id: 32,
          type: "message",
          kind: "message.deleted",
          message: {
            id: "00000000-0000-4000-8000-000000000032",
            stream_uuid: STREAM_UUID_10,
            topic_uuid: TOPIC_UUID_7,
          },
        },
        ctx,
      );

      expect(ctx.chatList.handleDeleteMessages).toHaveBeenCalledWith([
        "00000000-0000-4000-8000-000000000032",
      ]);
      expect(ctx.currentChat.removeMessages).toHaveBeenCalledWith([
        "00000000-0000-4000-8000-000000000032",
      ]);
      expect(ctx.currentChat.appendMessage).not.toHaveBeenCalled();
    });
  });

  describe("subscription peer events", () => {
    it("notifies peer_add stream ids from stream_ids payload", () => {
      const { ctx } = buildCtx();
      const onStreamPeerMembersChanged = vi.fn();

      dispatchMessengerEvent(
        {
          id: 5,
          type: "subscription",
          op: "peer_add",
          stream_uuids: [STREAM_UUID_10, STREAM_UUID_11],
        },
        {
          ...ctx,
          onStreamPeerMembersChanged,
        },
      );

      expect(onStreamPeerMembersChanged).toHaveBeenCalledWith([STREAM_UUID_10, STREAM_UUID_11]);
    });

    it("notifies peer_remove stream ids from subscriptions payload", () => {
      const { ctx } = buildCtx();
      const onStreamPeerMembersChanged = vi.fn();

      dispatchMessengerEvent(
        {
          id: 6,
          type: "subscription",
          op: "peer_remove",
          subscriptions: [
            { stream_uuid: "00000000-0000-4000-8000-000000000042", name: "engineering" },
          ],
        },
        {
          ...ctx,
          onStreamPeerMembersChanged,
        },
      );

      expect(onStreamPeerMembersChanged).toHaveBeenCalledWith([STREAM_UUID_42]);
    });

    it("notifies stream ids from stream_bindings.created payload", () => {
      const { ctx } = buildCtx();
      const onStreamPeerMembersChanged = vi.fn();

      dispatchMessengerEvent(
        {
          id: 7,
          type: "stream_binding",
          kind: "stream_bindings.created",
          stream_uuid: STREAM_UUID_42,
          stream_bindings: [
            {
              uuid: "00000000-0000-4000-8000-000000000099",
              stream_uuid: STREAM_UUID_42,
              user_uuid: "00000000-0000-4000-8000-000000000100",
              role: "member",
            },
          ],
        },
        {
          ...ctx,
          onStreamPeerMembersChanged,
        },
      );

      expect(onStreamPeerMembersChanged).toHaveBeenCalledWith([STREAM_UUID_42]);
    });

    it("notifies stream ids from stream_bindings.created items payload", () => {
      const { ctx } = buildCtx();
      const onStreamPeerMembersChanged = vi.fn();

      dispatchMessengerEvent(
        {
          id: 8,
          type: "stream_binding",
          kind: "stream_bindings.created",
          uuid: STREAM_UUID_42,
          items: [
            {
              uuid: "00000000-0000-4000-8000-000000000098",
              stream_uuid: STREAM_UUID_42,
              user_uuid: "00000000-0000-4000-8000-000000000101",
              role: "member",
            },
          ],
        },
        {
          ...ctx,
          onStreamPeerMembersChanged,
        },
      );

      expect(onStreamPeerMembersChanged).toHaveBeenCalledWith([STREAM_UUID_42]);
    });

    it("updates channel add-subscribers metadata on subscription update event", () => {
      const { ctx } = buildCtx();
      const upsertSpy = vi.spyOn(ctx.chatList, "upsertStreamMetadataRows");
      ctx.chatList.streamsMap.set(STREAM_UUID_42, {
        streamUuid: "00000000-0000-4000-8000-000000000042",
        name: "engineering",
        lastMessage: "",
        time: "",
        ts: 0,
        topics: new Map(),
      });

      dispatchMessengerEvent(
        {
          id: 7,
          type: "subscription",
          op: "update",
          stream_uuid: "00000000-0000-4000-8000-000000000042",
          property: "can_add_subscribers_group",
          value: { direct_members: [USER_UUID_1, USER_UUID_2], direct_subgroups: [] },
        },
        ctx,
      );

      expect(upsertSpy).toHaveBeenCalledWith([
        {
          streamUuid: "00000000-0000-4000-8000-000000000042",
          name: "engineering",
          canAddSubscribersGroup: {
            direct_members: [USER_UUID_1, USER_UUID_2],
            direct_subgroups: [],
          },
        },
      ]);
    });

    it("maps owner UUID on subscription add metadata row", () => {
      const { ctx } = buildCtx();
      const upsertSpy = vi.spyOn(ctx.chatList, "upsertStreamMetadataRows");
      const ownerUuid = "00000000-0000-4000-8000-000000000077";

      dispatchMessengerEvent(
        {
          id: 17,
          type: "subscription",
          op: "add",
          subscriptions: [
            {
              stream_uuid: "00000000-0000-4000-8000-000000000042",
              name: "engineering",
              owner: ownerUuid,
            },
          ],
        },
        ctx,
      );

      expect(upsertSpy).toHaveBeenCalledWith([
        {
          streamUuid: "00000000-0000-4000-8000-000000000042",
          name: "engineering",
          creatorId: ownerUuid,
        },
      ]);
    });

    it("updates channel remove-subscribers metadata on subscription update event", () => {
      const { ctx } = buildCtx();
      const upsertSpy = vi.spyOn(ctx.chatList, "upsertStreamMetadataRows");
      ctx.chatList.streamsMap.set(STREAM_UUID_42, {
        streamUuid: "00000000-0000-4000-8000-000000000042",
        name: "engineering",
        lastMessage: "",
        time: "",
        ts: 0,
        topics: new Map(),
      });

      dispatchMessengerEvent(
        {
          id: 8,
          type: "subscription",
          op: "update",
          stream_uuid: "00000000-0000-4000-8000-000000000042",
          property: "can_remove_subscribers_group",
          value: { direct_members: [USER_UUID_7], direct_subgroups: [] },
        },
        ctx,
      );

      expect(upsertSpy).toHaveBeenCalledWith([
        {
          streamUuid: "00000000-0000-4000-8000-000000000042",
          name: "engineering",
          canRemoveSubscribersGroup: { direct_members: [USER_UUID_7], direct_subgroups: [] },
        },
      ]);
    });

    it("updates archived flag on subscription update event", () => {
      const { ctx } = buildCtx();
      const upsertSpy = vi.spyOn(ctx.chatList, "upsertStreamMetadataRows");
      ctx.chatList.streamsMap.set(STREAM_UUID_42, {
        streamUuid: "00000000-0000-4000-8000-000000000042",
        name: "engineering",
        lastMessage: "",
        time: "",
        ts: 0,
        topics: new Map(),
      });

      dispatchMessengerEvent(
        {
          id: 9,
          type: "subscription",
          op: "update",
          stream_uuid: "00000000-0000-4000-8000-000000000042",
          property: "is_archived",
          value: true,
        },
        ctx,
      );

      expect(upsertSpy).toHaveBeenCalledWith([
        {
          streamUuid: "00000000-0000-4000-8000-000000000042",
          name: "engineering",
          isArchived: true,
        },
      ]);
    });
  });

  describe("update_message_flags", () => {
    it("adds read flag to open chat messages when queue reports read ids", () => {
      useCurrentChatMessagesStore.getState().setContext({
        type: "stream",
        streamId: "00000000-0000-4000-8000-000000000005",
        streamName: "general",
        topic: "topic1",
        streamWideView: false,
      });
      useCurrentChatMessagesStore
        .getState()
        .setMessages([mockMsg(10, { flags: [] }), mockMsg(11, { flags: ["read"] })]);

      dispatchMessengerEvent(
        {
          id: 102,
          type: "update_message_flags",
          op: "add",
          flag: "read",
          messages: [testMessageId(10)],
        },
        buildIntegrationCtx(),
      );

      const messages = useCurrentChatMessagesStore.getState().messages;
      expect(messages.find((m) => m.id === testMessageId(10))?.flags).toContain("read");
      expect(messages.find((m) => m.id === testMessageId(11))?.flags).toContain("read");
    });

    it("marks inbox stale after read:add without locally removing entries", () => {
      useInboxStore.getState().setEntries([
        {
          key: "stream:11111111-1111-4111-8111-111111111111:topic1",
          streamId: "11111111-1111-4111-8111-111111111111",
          streamName: "general",
          topic: "topic1",
          senderId: null,
          senderName: null,
          dmSlug: null,
          unreadCount: 1,
          lastMessageTimestamp: 12,
          messageIds: ["00000000-0000-4000-8000-000000000012"],
        },
      ]);
      const markStaleSpy = vi.spyOn(useInboxStore.getState(), "markStale");
      markStaleSpy.mockClear();

      dispatchMessengerEvent(
        {
          id: 1021,
          type: "update_message_flags",
          op: "add",
          flag: "read",
          messages: [testMessageId(12)],
        },
        buildIntegrationCtx(),
      );

      expect(useInboxStore.getState().entries).toHaveLength(1);
      expect(markStaleSpy).toHaveBeenCalledTimes(1);
      markStaleSpy.mockRestore();
    });

    it("does not mutate open chat messages when read event targets another context", () => {
      useCurrentChatMessagesStore.getState().setContext({
        type: "stream",
        streamId: "00000000-0000-4000-8000-000000000005",
        streamName: "general",
        topic: "topicA",
        streamWideView: false,
      });
      useCurrentChatMessagesStore.getState().setMessages([mockMsg(50, { flags: [] })]);

      dispatchMessengerEvent(
        {
          id: 103,
          type: "update_message_flags",
          op: "add",
          flag: "read",
          messages: [testMessageId(10)],
        },
        buildIntegrationCtx(),
      );

      expect(useCurrentChatMessagesStore.getState().messages[0]!.flags ?? []).not.toContain("read");
    });

    it("marks loaded messages read on markAllRead queue event", () => {
      useCurrentChatMessagesStore
        .getState()
        .setMessages([mockMsg(100, { flags: [] }), mockMsg(101, { flags: [] })]);

      dispatchMessengerEvent(
        {
          id: 104,
          type: "update_message_flags",
          op: "add",
          flag: "read",
          all: true,
          messages: [],
        },
        buildIntegrationCtx(),
      );

      for (const message of useCurrentChatMessagesStore.getState().messages) {
        expect(message.flags).toContain("read");
      }
    });

    it("uses operation field when op is missing", () => {
      useCurrentChatMessagesStore.getState().setMessages([mockMsg(20, { flags: ["read"] })]);

      dispatchMessengerEvent(
        {
          id: 105,
          type: "update_message_flags",
          operation: "remove",
          flag: "read",
          messages: [testMessageId(20)],
        },
        buildIntegrationCtx(),
      );

      expect(useCurrentChatMessagesStore.getState().messages[0]!.flags ?? []).not.toContain("read");
    });

    it("keeps inbox entries unchanged on read:add and waits for server refresh", () => {
      const inboxEntry: InboxEntry = {
        key: "stream:5:topic1",
        streamId: "00000000-0000-4000-8000-000000000005",
        streamName: "general",
        topic: "topic1",
        senderId: null,
        senderName: null,
        dmSlug: null,
        unreadCount: 3,
        lastMessageTimestamp: 100,
        messageIds: [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
          "00000000-0000-4000-8000-000000000003",
        ],
      };
      useInboxStore.getState().setEntries([inboxEntry]);
      const markStaleSpy = vi.spyOn(useInboxStore.getState(), "markStale");
      markStaleSpy.mockClear();

      dispatchMessengerEvent(
        {
          id: 106,
          type: "update_message_flags",
          op: "add",
          flag: "read",
          messages: [testMessageId(1), testMessageId(2)],
        },
        buildIntegrationCtx(),
      );

      const entries = useInboxStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(inboxEntry);
      expect(markStaleSpy).toHaveBeenCalledTimes(1);
      markStaleSpy.mockRestore();
    });

    it("clears inbox entries on mark all read", () => {
      useInboxStore.getState().setEntries([
        {
          key: "dm:42",
          streamId: null,
          streamName: null,
          topic: null,
          senderId: 42,
          senderName: "Alice",
          dmSlug: "42",
          unreadCount: 1,
          lastMessageTimestamp: 10,
          messageIds: ["00000000-0000-4000-8000-000000000001"],
        },
      ]);

      dispatchMessengerEvent(
        {
          id: 107,
          type: "update_message_flags",
          op: "add",
          flag: "read",
          all: true,
          messages: [],
        },
        buildIntegrationCtx(),
      );

      expect(useInboxStore.getState().entries).toHaveLength(0);
    });
  });
});
