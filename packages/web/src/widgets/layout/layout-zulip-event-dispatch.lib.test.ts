import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import * as client from "~/shared/api/client";
import type { ZulipEvent } from "~/shared/api/zulip.types";
import { dispatchZulipEvent } from "./layout-zulip-event-dispatch.lib";
import type {
  LayoutCurrentChatActions,
  LayoutZulipEventDispatchContext,
} from "./layout-zulip-event-dispatch.types";

function buildCtx(
  overrides: {
    updateMessageContentMock?: ReturnType<typeof vi.fn>;
    moveStreamTopicMock?: ReturnType<typeof vi.fn>;
    moveStreamTopicMessagesMock?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const noop = vi.fn();
  const updateMessageContentMock = overrides.updateMessageContentMock ?? vi.fn();
  const moveStreamTopicMock = overrides.moveStreamTopicMock ?? vi.fn();
  const moveStreamTopicMessagesMock = overrides.moveStreamTopicMessagesMock ?? vi.fn();
  const ctx: LayoutZulipEventDispatchContext = {
    chatList: {
      currentUserId: 1,
      streamsMap: new Map(),
      addMessage: noop,
      upsertStreamMetadataRows: noop,
      renameStream: noop,
      moveStreamTopic:
        moveStreamTopicMock as LayoutZulipEventDispatchContext["chatList"]["moveStreamTopic"],
      removeStream: noop,
      decrementUnreadForMessages: noop,
      incrementUnreadForMessages: noop,
      handleDeleteMessages: noop,
    },
    currentChat: {
      context: null,
      appendMessage: noop,
      updateMessageFlags: noop,
      updateMessageReaction: noop,
      removeMessages: noop,
      updateMessageContent:
        updateMessageContentMock as LayoutCurrentChatActions["updateMessageContent"],
      moveStreamTopicMessages:
        moveStreamTopicMessagesMock as LayoutCurrentChatActions["moveStreamTopicMessages"],
    },
    users: {
      mergeFromMessage: noop,
      setPresenceByEmail: noop,
      setStatus: noop,
    },
    typing: { setTyping: noop },
    mute: {
      isEffectivelyMuted: () => false,
      muteStream: noop,
      unmuteStream: noop,
      muteTopic: noop,
      unmuteTopic: noop,
      followTopic: noop,
      clearTopicVisibilityOverride: noop,
    },
    activity: { markStale: noop, markStarredSummaryStale: noop },
    inbox: { markStale: noop },
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
  return { ctx, updateMessageContentMock, moveStreamTopicMock, moveStreamTopicMessagesMock };
}

describe("dispatchZulipEvent", () => {
  let getInstanceSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getInstanceSpy = vi.spyOn(client, "getCurrentInstance").mockReturnValue(null);
  });

  afterEach(() => {
    getInstanceSpy.mockRestore();
    useChatListStore.getState().clear();
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
        } as ZulipEvent,
        ctx,
      );
      expect(updateMessageContentMock).toHaveBeenCalledWith(42, "*new*", "*new*");
    });

    it("does not overwrite content when rendering_only", () => {
      const { ctx, updateMessageContentMock, moveStreamTopicMock } = buildCtx();
      dispatchZulipEvent(
        {
          id: 2,
          type: "update_message",
          message_id: 7,
          rendered_content: "<p>preview</p>",
          content: "same md",
          rendering_only: true,
        } as ZulipEvent,
        ctx,
      );
      expect(updateMessageContentMock).not.toHaveBeenCalled();
      expect(moveStreamTopicMock).not.toHaveBeenCalled();
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
        } as ZulipEvent,
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

    it("does not move topic when update_message lacks topic rename payload", () => {
      const { ctx, moveStreamTopicMock, moveStreamTopicMessagesMock } = buildCtx();
      dispatchZulipEvent(
        {
          id: 4,
          type: "update_message",
          message_id: 7,
          stream_id: 42,
          subject: "incident",
        } as ZulipEvent,
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
        } as ZulipEvent,
        integrationCtx,
      );
      dispatchZulipEvent(
        {
          id: 11,
          type: "delete_message",
          message_ids: [1],
        } as ZulipEvent,
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
        } as ZulipEvent,
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
        } as ZulipEvent,
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
        } as ZulipEvent,
        ctx,
      );

      expect(followSpy).toHaveBeenCalledWith(42, "incidents");
    });
  });

  describe("stream", () => {
    // Что проверяет: stream:create должен добавлять metadata канала в sidebar store.
    // Зачем: новый канал должен появляться сразу, даже если в нем еще нет новых сообщений.
    it("upserts stream metadata on stream create", () => {
      const { ctx } = buildCtx();
      const upsertSpy = vi.spyOn(ctx.chatList, "upsertStreamMetadataRows");

      dispatchZulipEvent(
        {
          id: 18,
          type: "stream",
          op: "create",
          streams: [{ stream_id: 42, name: "engineering", creator_id: 77 }],
        } as ZulipEvent,
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

    // Что проверяет: stream:update с property=name переименовывает канал.
    // Зачем: регрессия для кейса, когда rename приходит stream-событием.
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
        } as ZulipEvent,
        ctx,
      );

      expect(renameSpy).toHaveBeenCalledWith(42, "engineering v2");
    });

    // Что проверяет: stream:delete удаляет канал из chat-list.
    // Зачем: после удаления канала UI не должен показывать устаревшую запись.
    it("removes stream on stream delete", () => {
      const { ctx } = buildCtx();
      const removeSpy = vi.spyOn(ctx.chatList, "removeStream");

      dispatchZulipEvent(
        {
          id: 20,
          type: "stream",
          op: "delete",
          stream_id: 42,
        } as ZulipEvent,
        ctx,
      );

      expect(removeSpy).toHaveBeenCalledWith(42);
    });
  });

  describe("message stream rename fallback", () => {
    // Что проверяет: fallback-ветка переименовывает канал по message.display_recipient.
    // Зачем: закрывает сценарий, где сервер не прислал stream:update, но в message уже новое имя канала.
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
        } as ZulipEvent,
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
        } as ZulipEvent,
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
        } as ZulipEvent,
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
        } as ZulipEvent,
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
        } as ZulipEvent,
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
        } as ZulipEvent,
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
  });
});
