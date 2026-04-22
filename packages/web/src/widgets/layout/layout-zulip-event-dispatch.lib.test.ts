import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  } = {},
) {
  const noop = vi.fn();
  const updateMessageContentMock = overrides.updateMessageContentMock ?? vi.fn();
  const ctx: LayoutZulipEventDispatchContext = {
    chatList: {
      currentUserId: 1,
      streamsMap: new Map(),
      addMessage: noop,
      upsertStreamMetadataRows: noop,
      renameStream: noop,
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
  return { ctx, updateMessageContentMock };
}

describe("dispatchZulipEvent", () => {
  let getInstanceSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getInstanceSpy = vi.spyOn(client, "getCurrentInstance").mockReturnValue(null);
  });

  afterEach(() => {
    getInstanceSpy.mockRestore();
  });

  describe("update_message", () => {
    it("stores rendered HTML and raw markdown when not rendering_only", () => {
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
      expect(updateMessageContentMock).toHaveBeenCalledWith(42, "<p>new</p>", "*new*");
    });

    it("updates rendered HTML without overwriting markdown_source when rendering_only", () => {
      const { ctx, updateMessageContentMock } = buildCtx();
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
      expect(updateMessageContentMock).toHaveBeenCalledWith(7, "<p>preview</p>", undefined);
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

    it("maps policy=3 (followed) to topic unmuted state for mute logic", () => {
      const { ctx } = buildCtx();
      const unmuteSpy = vi.spyOn(ctx.mute, "unmuteTopic");

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

      expect(unmuteSpy).toHaveBeenCalledWith(42, "incidents");
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
