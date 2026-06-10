import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyChatListReadDecrement } from "~/entities/chat-list/chat-list-apply-read-decrement.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import type { InboxEntry } from "~/entities/inbox/inbox.types";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import * as client from "~/shared/api/client";
import type { MockMessage } from "~/shared/api/zulip.types";
import { dispatchZulipEvent } from "./layout-zulip-event-dispatch.lib";
import type {
  LayoutCurrentChatActions,
  LayoutZulipEventDispatchContext,
} from "./layout-zulip-event-dispatch.types";

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
  const ctx: LayoutZulipEventDispatchContext = {
    currentInstanceId: "inst-1",
    chatList: {
      currentUserId: 1,
      streamsMap: new Map(),
      addMessage: noop,
      upsertStreamMetadataRows: noop,
      renameStream: noop,
      moveStreamTopic:
        moveStreamTopicMock as LayoutZulipEventDispatchContext["chatList"]["moveStreamTopic"],
      moveTopicToStream:
        moveTopicToStreamMock as LayoutZulipEventDispatchContext["chatList"]["moveTopicToStream"],
      removeStream: noop,
      decrementUnreadForMessages: noop,
      incrementUnreadForMessages: noop,
      handleDeleteMessages: noop,
    },
    currentChat: {
      context: null,
      hasNewerMessages: false,
      appendMessage: noop,
      updateMessageFlags: noop,
      updateMessageReaction: noop,
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
      mergeFromMessage: noop,
      setPresenceByEmail: noop,
      setStatus: noop,
    },
    typing: { setTyping: noop },
    mute: {
      isStreamMuted: () => false,
      isEffectivelyMuted: () => false,
      isTopicFollowed: () => false,
      getStreamDesktopNotificationsOverride: () => null,
      getStreamAudibleNotificationsOverride: () => null,
      muteStream: noop,
      unmuteStream: noop,
      muteTopic: noop,
      unmuteTopic: noop,
      followTopic: noop,
      clearTopicVisibilityOverride: noop,
      setStreamDesktopNotifications: noop,
      setStreamAudibleNotifications: noop,
    },
    activity: { markStale: noop, markStarredSummaryStale: noop },
    inbox: { markStale: noop, markAsRead: noop, clearEntries: noop },
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

function buildIntegrationCtx(): LayoutZulipEventDispatchContext {
  const noop = vi.fn();
  return {
    currentInstanceId: "inst-1",
    chatList: useChatListStore.getState(),
    currentChat: useCurrentChatMessagesStore.getState(),
    users: {
      mergeFromMessage: noop,
      setPresenceByEmail: noop,
      setStatus: noop,
    },
    typing: { setTyping: noop },
    mute: {
      isStreamMuted: () => false,
      isEffectivelyMuted: () => false,
      isTopicFollowed: () => false,
      getStreamDesktopNotificationsOverride: () => null,
      getStreamAudibleNotificationsOverride: () => null,
      muteStream: noop,
      unmuteStream: noop,
      muteTopic: noop,
      unmuteTopic: noop,
      followTopic: noop,
      clearTopicVisibilityOverride: noop,
      setStreamDesktopNotifications: noop,
      setStreamAudibleNotifications: noop,
    },
    activity: { markStale: noop, markStarredSummaryStale: noop },
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

describe("dispatchZulipEvent", () => {
  let getInstanceSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getInstanceSpy = vi.spyOn(client, "getCurrentInstance").mockReturnValue(null);
  });

  afterEach(() => {
    getInstanceSpy.mockRestore();
    useChatListStore.getState().clear();
    useInboxStore.getState().clear();
    useCurrentChatMessagesStore.setState({
      context: null,
      messages: [],
      pendingOutgoingEchoKeys: [],
      isLoadingNewer: false,
    });
  });

  describe("update_message", () => {
    it("stores markdown as message content when not rendering_only", () => {
      const { ctx, updateMessageContentMock } = buildCtx();
      dispatchZulipEvent(
        {
          id: 1,
          type: "update_message",
          message_id: 42,
          rendered_content: "<p>new</p>",
          content: "*new*",
          rendering_only: false,
        },
        ctx,
      );
      expect(updateMessageContentMock).toHaveBeenCalledWith(42, "*new*", "*new*");
    });

    it("does not overwrite content when rendering_only", () => {
      const { ctx, updateMessageContentMock, updateMessageLinkPreviewMock, moveStreamTopicMock } =
        buildCtx();
      dispatchZulipEvent(
        {
          id: 2,
          type: "update_message",
          message_id: 7,
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
      dispatchZulipEvent(
        {
          id: 5,
          type: "update_message",
          message_id: 9,
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
        id: 9,
        sender_id: 1,
        sender_full_name: "Alice",
        stream_id: 5,
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
        id: 9,
        sender_id: 1,
        sender_full_name: "Alice",
        stream_id: 5,
        subject: "general",
        content: "https://example.com",
        timestamp: 1,
      };
      useCurrentChatMessagesStore.setState({ messages: [message] });
      dispatchZulipEvent(
        {
          id: 4,
          type: "update_message",
          message_id: 9,
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
      expect(updateMessageLinkPreviewMock).toHaveBeenCalledWith(9, {
        targetUrl: "https://example.com",
        title: "Example",
        description: "Site description",
      });
    });

    it("moves stream topic in chat list when topic is renamed", () => {
      const { ctx, moveStreamTopicMock, moveStreamTopicMessagesMock } = buildCtx();
      dispatchZulipEvent(
        {
          id: 3,
          type: "update_message",
          message_id: 99,
          stream_id: 42,
          orig_subject: "incident",
          subject: "\u2714 incident",
          message_ids: [1, 2, 3],
        },
        ctx,
      );
      expect(moveStreamTopicMock).toHaveBeenCalledWith({
        streamId: 42,
        oldTopic: "incident",
        newTopic: "\u2714 incident",
        messageIds: [1, 2, 3],
        anchorMessageId: 99,
      });
      expect(moveStreamTopicMessagesMock).toHaveBeenCalledWith({
        streamId: 42,
        oldTopic: "incident",
        newTopic: "\u2714 incident",
        messageIds: [1, 2, 3],
        anchorMessageId: 99,
      });
    });

    it("moves stream topic to another channel when new_stream_id is present", () => {
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
          20,
          {
            stream_id: 20,
            name: "dev",
            lastMessage: "",
            time: "",
            ts: 0,
            topics: new Map(),
          },
        ],
      ]);
      dispatchZulipEvent(
        {
          id: 4,
          type: "update_message",
          message_id: 99,
          stream_id: 10,
          new_stream_id: 20,
          orig_subject: "incident",
          subject: "incident",
          message_ids: [1, 2],
        },
        ctx,
      );
      expect(moveTopicToStreamMock).toHaveBeenCalledWith({
        sourceStreamId: 10,
        targetStreamId: 20,
        oldTopic: "incident",
        newTopic: "incident",
        messageIds: [1, 2],
        anchorMessageId: 99,
      });
      expect(moveTopicToStreamMessagesMock).toHaveBeenCalledWith({
        sourceStreamId: 10,
        targetStreamId: 20,
        oldTopic: "incident",
        newTopic: "incident",
        messageIds: [1, 2],
        anchorMessageId: 99,
        targetStreamName: "dev",
      });
      expect(moveStreamTopicMock).not.toHaveBeenCalled();
      expect(moveStreamTopicMessagesMock).not.toHaveBeenCalled();
    });

    it("does not move topic when update_message lacks topic rename payload", () => {
      const { ctx, moveStreamTopicMock, moveStreamTopicMessagesMock } = buildCtx();
      dispatchZulipEvent(
        {
          id: 4,
          type: "update_message",
          message_id: 7,
          stream_id: 42,
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
            id: 1,
            sender_id: 10,
            sender_full_name: "Alice",
            content: "first",
            timestamp: 1000,
            type: "stream",
            stream_id: 42,
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
      const integrationCtx: LayoutZulipEventDispatchContext = {
        ...ctx,
        chatList: {
          ...ctx.chatList,
          streamsMap: realStreamsMap,
          moveStreamTopic: realChatListState.moveStreamTopic,
          handleDeleteMessages: realChatListState.handleDeleteMessages,
        },
      };

      dispatchZulipEvent(
        {
          id: 10,
          type: "update_message",
          message_id: 1,
          stream_id: 42,
          orig_subject: "incident",
          subject: "\u2714 incident",
          message_ids: [1],
        },
        integrationCtx,
      );
      dispatchZulipEvent(
        {
          id: 11,
          type: "delete_message",
          message_ids: [1],
        },
        integrationCtx,
      );

      const stream = useChatListStore.getState().streamsMap.get(42);
      expect(stream?.topics.has("\u2714 incident")).toBe(true);
      expect(stream?.topics.get("\u2714 incident")?.lastMessageId).toBe(undefined);
    });
  });

  describe("user_topic", () => {
    it("maps policy=0 to clearing topic visibility override", () => {
      const { ctx } = buildCtx();
      const clearSpy = vi.spyOn(ctx.mute, "clearTopicVisibilityOverride");

      dispatchZulipEvent(
        {
          id: 3,
          type: "user_topic",
          stream_id: 42,
          topic_name: "incidents",
          visibility_policy: 0,
        },
        ctx,
      );

      expect(clearSpy).toHaveBeenCalledWith(42, "incidents");
    });

    it("maps policy=3 (followed) to separate followed topic state", () => {
      const { ctx } = buildCtx();
      const followSpy = vi.spyOn(ctx.mute, "followTopic");

      dispatchZulipEvent(
        {
          id: 4,
          type: "user_topic",
          stream_id: 42,
          topic_name: "incidents",
          visibility_policy: 3,
        },
        ctx,
      );

      expect(followSpy).toHaveBeenCalledWith(42, "incidents");
    });

    it("normalizes user_topic names before updating mute store", () => {
      const { ctx } = buildCtx();
      const followSpy = vi.spyOn(ctx.mute, "followTopic");

      dispatchZulipEvent(
        {
          id: 5,
          type: "user_topic",
          stream_id: 42,
          topic_name: "  incidents  ",
          visibility_policy: 3,
        },
        ctx,
      );

      expect(followSpy).toHaveBeenCalledWith(42, "incidents");
    });
  });

  describe("subscription notification properties", () => {
    it("updates desktop_notifications on subscription update", () => {
      const { ctx } = buildCtx();
      const desktopSpy = vi.spyOn(ctx.mute, "setStreamDesktopNotifications");

      dispatchZulipEvent(
        {
          id: 90,
          type: "subscription",
          op: "update",
          stream_id: 42,
          property: "desktop_notifications",
          value: true,
        },
        ctx,
      );

      expect(desktopSpy).toHaveBeenCalledWith(42, true);
    });

    it("updates audible_notifications on subscription update", () => {
      const { ctx } = buildCtx();
      const audibleSpy = vi.spyOn(ctx.mute, "setStreamAudibleNotifications");

      dispatchZulipEvent(
        {
          id: 91,
          type: "subscription",
          op: "update",
          stream_id: 42,
          property: "audible_notifications",
          value: false,
        },
        ctx,
      );

      expect(audibleSpy).toHaveBeenCalledWith(42, false);
    });
  });

  describe("stream", () => {
    // Assert: stream:create must add channel metadata to the sidebar store.
    // Why: new channels must appear immediately even without new messages.
    it("upserts stream metadata on stream create", () => {
      const { ctx } = buildCtx();
      const upsertSpy = vi.spyOn(ctx.chatList, "upsertStreamMetadataRows");

      dispatchZulipEvent(
        {
          id: 18,
          type: "stream",
          op: "create",
          streams: [{ stream_id: 42, name: "engineering", creator_id: 77 }],
        },
        ctx,
      );

      expect(upsertSpy).toHaveBeenCalledWith([
        {
          streamId: 42,
          name: "engineering",
          creatorId: 77,
        },
      ]);
    });

    it("maps is_archived on stream create metadata row", () => {
      const { ctx } = buildCtx();
      const upsertSpy = vi.spyOn(ctx.chatList, "upsertStreamMetadataRows");

      dispatchZulipEvent(
        {
          id: 181,
          type: "stream",
          op: "create",
          streams: [{ stream_id: 42, name: "engineering", is_archived: true }],
        },
        ctx,
      );

      expect(upsertSpy).toHaveBeenCalledWith([
        {
          streamId: 42,
          name: "engineering",
          isArchived: true,
        },
      ]);
    });

    // Assert: stream:update with property=name renames the channel.
    // Why: regression when rename arrives as a stream event.
    it("renames stream on stream update(name)", () => {
      const { ctx } = buildCtx();
      const renameSpy = vi.spyOn(ctx.chatList, "renameStream");

      dispatchZulipEvent(
        {
          id: 19,
          type: "stream",
          op: "update",
          stream_id: 42,
          property: "name",
          value: "engineering v2",
        },
        ctx,
      );

      expect(renameSpy).toHaveBeenCalledWith(42, "engineering v2");
    });

    it("updates archived flag on stream update(is_archived)", () => {
      const { ctx } = buildCtx();
      const upsertSpy = vi.spyOn(ctx.chatList, "upsertStreamMetadataRows");
      ctx.chatList.streamsMap.set(42, {
        stream_id: 42,
        name: "engineering",
        lastMessage: "",
        time: "",
        ts: 0,
        topics: new Map(),
      });

      dispatchZulipEvent(
        {
          id: 191,
          type: "stream",
          op: "update",
          stream_id: 42,
          property: "is_archived",
          value: true,
        },
        ctx,
      );

      expect(upsertSpy).toHaveBeenCalledWith([
        {
          streamId: 42,
          name: "engineering",
          isArchived: true,
        },
      ]);
    });

    // Assert: stream:delete removes the channel from chat-list.
    // Why: UI must not show a stale entry after channel deletion.
    it("removes stream on stream delete", () => {
      const { ctx } = buildCtx();
      const removeSpy = vi.spyOn(ctx.chatList, "removeStream");

      dispatchZulipEvent(
        {
          id: 20,
          type: "stream",
          op: "delete",
          stream_id: 42,
        },
        ctx,
      );

      expect(removeSpy).toHaveBeenCalledWith(42);
    });
  });

  describe("message stream rename fallback", () => {
    // Assert: fallback renames channel from message.display_recipient.
    // Why: server may omit stream:update while message already has the new name.
    it("renames stream from message display_recipient when stream event is absent", () => {
      const { ctx } = buildCtx();
      const renameSpy = vi.spyOn(ctx.chatList, "renameStream");

      dispatchZulipEvent(
        {
          id: 21,
          type: "message",
          flags: [],
          message: {
            id: 1988,
            sender_id: 6,
            content: "rename notice",
            timestamp: 1777960620,
            type: "stream",
            stream_id: 16,
            display_recipient: "##КокоБомбони V2",
            subject: "события канала",
          },
        },
        ctx,
      );

      expect(renameSpy).toHaveBeenCalledWith(16, "##КокоБомбони V2");
    });
  });

  describe("subscription peer events", () => {
    it("notifies peer_add stream ids from stream_ids payload", () => {
      const { ctx } = buildCtx();
      const onStreamPeerMembersChanged = vi.fn();

      dispatchZulipEvent(
        {
          id: 5,
          type: "subscription",
          op: "peer_add",
          stream_ids: [10, 11],
        },
        {
          ...ctx,
          onStreamPeerMembersChanged,
        },
      );

      expect(onStreamPeerMembersChanged).toHaveBeenCalledWith([10, 11]);
    });

    it("notifies peer_remove stream ids from subscriptions payload", () => {
      const { ctx } = buildCtx();
      const onStreamPeerMembersChanged = vi.fn();

      dispatchZulipEvent(
        {
          id: 6,
          type: "subscription",
          op: "peer_remove",
          subscriptions: [{ stream_id: 42, name: "engineering" }],
        },
        {
          ...ctx,
          onStreamPeerMembersChanged,
        },
      );

      expect(onStreamPeerMembersChanged).toHaveBeenCalledWith([42]);
    });

    it("updates channel add-subscribers metadata on subscription update event", () => {
      const { ctx } = buildCtx();
      const upsertSpy = vi.spyOn(ctx.chatList, "upsertStreamMetadataRows");
      ctx.chatList.streamsMap.set(42, {
        stream_id: 42,
        name: "engineering",
        lastMessage: "",
        time: "",
        ts: 0,
        topics: new Map(),
      });

      dispatchZulipEvent(
        {
          id: 7,
          type: "subscription",
          op: "update",
          stream_id: 42,
          property: "can_add_subscribers_group",
          value: { direct_members: [1, 2], direct_subgroups: [] },
        },
        ctx,
      );

      expect(upsertSpy).toHaveBeenCalledWith([
        {
          streamId: 42,
          name: "engineering",
          canAddSubscribersGroup: { direct_members: [1, 2], direct_subgroups: [] },
        },
      ]);
    });

    it("maps creator_id on subscription add metadata row", () => {
      const { ctx } = buildCtx();
      const upsertSpy = vi.spyOn(ctx.chatList, "upsertStreamMetadataRows");

      dispatchZulipEvent(
        {
          id: 17,
          type: "subscription",
          op: "add",
          subscriptions: [{ stream_id: 42, name: "engineering", creator_id: 77 }],
        },
        ctx,
      );

      expect(upsertSpy).toHaveBeenCalledWith([
        {
          streamId: 42,
          name: "engineering",
          creatorId: 77,
        },
      ]);
    });

    it("updates channel remove-subscribers metadata on subscription update event", () => {
      const { ctx } = buildCtx();
      const upsertSpy = vi.spyOn(ctx.chatList, "upsertStreamMetadataRows");
      ctx.chatList.streamsMap.set(42, {
        stream_id: 42,
        name: "engineering",
        lastMessage: "",
        time: "",
        ts: 0,
        topics: new Map(),
      });

      dispatchZulipEvent(
        {
          id: 8,
          type: "subscription",
          op: "update",
          stream_id: 42,
          property: "can_remove_subscribers_group",
          value: { direct_members: [7], direct_subgroups: [] },
        },
        ctx,
      );

      expect(upsertSpy).toHaveBeenCalledWith([
        {
          streamId: 42,
          name: "engineering",
          canRemoveSubscribersGroup: { direct_members: [7], direct_subgroups: [] },
        },
      ]);
    });

    it("updates archived flag on subscription update event", () => {
      const { ctx } = buildCtx();
      const upsertSpy = vi.spyOn(ctx.chatList, "upsertStreamMetadataRows");
      ctx.chatList.streamsMap.set(42, {
        stream_id: 42,
        name: "engineering",
        lastMessage: "",
        time: "",
        ts: 0,
        topics: new Map(),
      });

      dispatchZulipEvent(
        {
          id: 9,
          type: "subscription",
          op: "update",
          stream_id: 42,
          property: "is_archived",
          value: true,
        },
        ctx,
      );

      expect(upsertSpy).toHaveBeenCalledWith([
        {
          streamId: 42,
          name: "engineering",
          isArchived: true,
        },
      ]);
    });
  });

  describe("update_message_flags", () => {
    it("decrements sidebar unread with topic fallback when read id is missing from index", () => {
      useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);
      useChatListStore.getState().reconcileUnreadFromSnapshot(
        {
          streams: [{ streamId: 5, topic: "topic1", unreadMessageIds: [1, 2, 3] }],
          dms: [],
          totalCount: 3,
          mentionMessageIds: [],
        },
        1,
      );
      useChatListStore.setState({
        messageIdToLocation: new Map([[1, { type: "stream", stream_id: 5, topic: "topic1" }]]),
      });

      const { ctx } = buildCtx();
      ctx.currentChat.context = {
        type: "stream",
        streamId: 5,
        streamName: "general",
        topic: "topic1",
        streamWideView: false,
      };

      dispatchZulipEvent(
        {
          id: 99,
          type: "update_message_flags",
          op: "add",
          flag: "read",
          messages: [1, 2, 3],
        },
        ctx,
      );

      expect(useChatListStore.getState().streamsMap.get(5)?.topics.get("topic1")?.unreadCount).toBe(
        0,
      );
    });

    it("skips sidebar decrement when optimistic read already cleared open DM unread", () => {
      useChatListStore.getState().setCurrentUserId(10);
      useChatListStore
        .getState()
        .upsertDmMetadataRows([{ userIds: [10, 20], lastMessageId: 3083, unreadCount: 0 }]);
      useChatListStore.getState().reconcileUnreadFromSnapshot(
        {
          streams: [],
          dms: [{ userIds: [20], unreadMessageIds: [3081, 3082, 3083], isGroup: false }],
          totalCount: 3,
          mentionMessageIds: [],
        },
        10,
      );

      const store = useChatListStore.getState();
      applyChatListReadDecrement(() => useChatListStore.getState(), store, {
        messageIds: [3081, 3082, 3083],
        fallbackContext: { type: "dm", dmKey: "10,20" },
        source: "test:optimistic",
      });
      expect(useChatListStore.getState().dmsMap.get("10,20")?.unreadCount).toBe(0);

      const { ctx } = buildCtx();
      ctx.currentChat.context = { type: "dm", dmKey: "10,20" };

      dispatchZulipEvent(
        {
          id: 100,
          type: "update_message_flags",
          op: "add",
          flag: "read",
          messages: [3081, 3082, 3083],
        },
        ctx,
      );

      expect(useChatListStore.getState().dmsMap.get("10,20")?.unreadCount).toBe(0);
    });

    it("decrements unread for read topic while a different chat is open", () => {
      useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);
      useChatListStore.getState().reconcileUnreadFromSnapshot(
        {
          streams: [
            { streamId: 5, topic: "topicA", unreadMessageIds: [1] },
            { streamId: 5, topic: "topicB", unreadMessageIds: [10, 11] },
          ],
          dms: [],
          totalCount: 3,
          mentionMessageIds: [],
        },
        1,
      );

      const { ctx } = buildCtx();
      ctx.currentChat.context = {
        type: "stream",
        streamId: 5,
        streamName: "general",
        topic: "topicA",
        streamWideView: false,
      };
      expect(useChatListStore.getState().streamsMap.get(5)?.topics.get("topicB")?.unreadCount).toBe(
        2,
      );

      dispatchZulipEvent(
        {
          id: 101,
          type: "update_message_flags",
          op: "add",
          flag: "read",
          messages: [10, 11],
        },
        ctx,
      );

      expect(useChatListStore.getState().streamsMap.get(5)?.topics.get("topicB")?.unreadCount).toBe(
        0,
      );
      expect(useChatListStore.getState().streamsMap.get(5)?.topics.get("topicA")?.unreadCount).toBe(
        1,
      );
    });

    it("adds read flag to open chat messages when queue reports read ids", () => {
      useCurrentChatMessagesStore.getState().setContext({
        type: "stream",
        streamId: 5,
        streamName: "general",
        topic: "topic1",
        streamWideView: false,
      });
      useCurrentChatMessagesStore
        .getState()
        .setMessages([mockMsg(10, { flags: [] }), mockMsg(11, { flags: ["read"] })]);

      dispatchZulipEvent(
        {
          id: 102,
          type: "update_message_flags",
          op: "add",
          flag: "read",
          messages: [10],
        },
        buildIntegrationCtx(),
      );

      const messages = useCurrentChatMessagesStore.getState().messages;
      expect(messages.find((m) => m.id === 10)?.flags).toContain("read");
      expect(messages.find((m) => m.id === 11)?.flags).toContain("read");
    });

    it("does not mutate open chat messages when read event targets another context", () => {
      useCurrentChatMessagesStore.getState().setContext({
        type: "stream",
        streamId: 5,
        streamName: "general",
        topic: "topicA",
        streamWideView: false,
      });
      useCurrentChatMessagesStore.getState().setMessages([mockMsg(50, { flags: [] })]);

      useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);
      useChatListStore.getState().reconcileUnreadFromSnapshot(
        {
          streams: [{ streamId: 5, topic: "topicB", unreadMessageIds: [10] }],
          dms: [],
          totalCount: 1,
          mentionMessageIds: [],
        },
        1,
      );

      dispatchZulipEvent(
        {
          id: 103,
          type: "update_message_flags",
          op: "add",
          flag: "read",
          messages: [10],
        },
        buildIntegrationCtx(),
      );

      expect(useCurrentChatMessagesStore.getState().messages[0]!.flags ?? []).not.toContain("read");
      expect(useChatListStore.getState().streamsMap.get(5)?.topics.get("topicB")?.unreadCount).toBe(
        0,
      );
    });

    it("marks all read on markAllRead queue event (all: true, empty messages)", () => {
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
      useCurrentChatMessagesStore
        .getState()
        .setMessages([mockMsg(100, { flags: [] }), mockMsg(101, { flags: [] })]);

      dispatchZulipEvent(
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

      expect(useChatListStore.getState().sidebarStreamsUnread).toBe(0);
      expect(useChatListStore.getState().sidebarDmsUnread).toBe(0);
      for (const message of useCurrentChatMessagesStore.getState().messages) {
        expect(message.flags).toContain("read");
      }
    });

    it("uses operation field when op is missing", () => {
      useCurrentChatMessagesStore.getState().setMessages([mockMsg(20, { flags: ["read"] })]);

      dispatchZulipEvent(
        {
          id: 105,
          type: "update_message_flags",
          operation: "remove",
          flag: "read",
          messages: [20],
        },
        buildIntegrationCtx(),
      );

      expect(useCurrentChatMessagesStore.getState().messages[0]!.flags ?? []).not.toContain("read");
    });

    it("incrementally updates inbox entries on read:add without markStale refetch", () => {
      const inboxEntry: InboxEntry = {
        key: "stream:5:topic1",
        streamId: 5,
        streamName: "general",
        topic: "topic1",
        senderId: null,
        senderName: null,
        dmSlug: null,
        unreadCount: 3,
        lastMessageTimestamp: 100,
        messageIds: [1, 2, 3],
      };
      useInboxStore.getState().setEntries([inboxEntry]);
      const markStaleSpy = vi.spyOn(useInboxStore.getState(), "markStale");

      dispatchZulipEvent(
        {
          id: 106,
          type: "update_message_flags",
          op: "add",
          flag: "read",
          messages: [1, 2],
        },
        buildIntegrationCtx(),
      );

      const entries = useInboxStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0]!.unreadCount).toBe(1);
      expect(entries[0]!.messageIds).toEqual([3]);
      expect(markStaleSpy).not.toHaveBeenCalled();
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
          messageIds: [1],
        },
      ]);

      dispatchZulipEvent(
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
