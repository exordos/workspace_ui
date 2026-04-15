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
      addMessage: noop,
      upsertStreamMetadataRows: noop,
      renameStream: noop,
      removeStream: noop,
      decrementUnreadForMessages: noop,
      incrementUnreadForMessages: noop,
      handleDeleteMessages: noop,
      upsertStreamMetadataRows: noop,
      renameStream: noop,
      removeStream: noop,
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
    it("stores markdown body when not rendering_only", () => {
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

    it("skips store update when rendering_only (markdown unchanged)", () => {
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
      expect(updateMessageContentMock).not.toHaveBeenCalled();
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
});
