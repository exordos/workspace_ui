import { describe, expect, it } from "vitest";
import {
  classifyWorkspaceNotificationTrigger,
  shouldNotify,
  shouldWorkspaceDesktopNotify,
} from "./notifications-policy";

describe("notifications-policy", () => {
  describe("shouldNotify", () => {
    it("returns false for messages from self", () => {
      expect(shouldNotify({ isFromSelf: true, isForCurrentChat: false, isMuted: false })).toBe(
        false,
      );
    });

    it("returns false for messages in current chat", () => {
      expect(shouldNotify({ isFromSelf: false, isForCurrentChat: true, isMuted: false })).toBe(
        false,
      );
    });

    it("returns false for muted messages", () => {
      expect(shouldNotify({ isFromSelf: false, isForCurrentChat: false, isMuted: true })).toBe(
        false,
      );
    });

    it("returns true for non-muted messages outside current chat", () => {
      expect(shouldNotify({ isFromSelf: false, isForCurrentChat: false, isMuted: false })).toBe(
        true,
      );
    });
  });

  describe("shouldWorkspaceDesktopNotify", () => {
    const baseViewport = {
      windowFocused: false,
      isMessageOnScreen: false,
    };

    const baseStreamMessage = {
      kind: "stream" as const,
      markdown: "hello team",
      isOwn: false,
      read: false,
      streamNotificationMode: "mentions_only" as const,
      topicNotificationMode: "default" as const,
    };

    it("returns false for own messages", () => {
      expect(
        shouldWorkspaceDesktopNotify({
          message: { ...baseStreamMessage, isOwn: true, streamNotificationMode: "all_messages" },
          viewport: baseViewport,
        }),
      ).toEqual({
        notify: false,
        trigger: "stream",
      });
    });

    it("returns false for read messages", () => {
      expect(
        shouldWorkspaceDesktopNotify({
          message: { ...baseStreamMessage, read: true, streamNotificationMode: "all_messages" },
          viewport: baseViewport,
        }),
      ).toEqual({
        notify: false,
        trigger: "stream",
      });
    });

    it("returns false when the backend notification gate is closed", () => {
      expect(
        shouldWorkspaceDesktopNotify({
          message: {
            kind: "dm",
            isOwn: false,
            read: false,
            notificationEligible: false,
          },
          viewport: baseViewport,
        }),
      ).toEqual({
        notify: false,
        trigger: "dm",
      });
    });

    it("notifies for dm", () => {
      expect(
        shouldWorkspaceDesktopNotify({
          message: {
            kind: "dm",
            markdown: "hello",
            isOwn: false,
            read: false,
          },
          viewport: baseViewport,
        }),
      ).toEqual({
        notify: true,
        trigger: "dm",
      });
    });

    it("detects mention only when resolver gives current user uuid match", () => {
      expect(
        shouldWorkspaceDesktopNotify({
          message: {
            ...baseStreamMessage,
            markdown: "ping @alice",
            currentUserUuid: "user-1",
            resolveMention: (displayText) =>
              displayText === "alice" ? { userUuid: "user-1", displayText: "Alice" } : null,
          },
          viewport: baseViewport,
        }),
      ).toEqual({
        notify: true,
        trigger: "mention",
      });
    });

    it("detects wildcard mentions with simple workspace aliases", () => {
      expect(
        shouldWorkspaceDesktopNotify({
          message: {
            ...baseStreamMessage,
            markdown: "heads up @everyone",
          },
          viewport: baseViewport,
        }),
      ).toEqual({
        notify: true,
        trigger: "wildcard_mention",
      });
    });

    it("uses precomputed mention flag without markdown", () => {
      expect(
        shouldWorkspaceDesktopNotify({
          message: {
            ...baseStreamMessage,
            markdown: undefined,
            hasCurrentUserMention: true,
          },
          viewport: baseViewport,
        }),
      ).toEqual({
        notify: true,
        trigger: "mention",
      });
    });

    it("uses precomputed wildcard flag without markdown", () => {
      expect(
        shouldWorkspaceDesktopNotify({
          message: {
            ...baseStreamMessage,
            markdown: undefined,
            hasWildcardMention: true,
          },
          viewport: baseViewport,
        }),
      ).toEqual({
        notify: true,
        trigger: "wildcard_mention",
      });
    });

    it("does not fall back to markdown when mention flag is already false", () => {
      expect(
        shouldWorkspaceDesktopNotify({
          message: {
            ...baseStreamMessage,
            markdown: `ping <@user-1>`,
            currentUserUuid: "user-1",
            hasCurrentUserMention: false,
          },
          viewport: baseViewport,
        }),
      ).toEqual({
        notify: false,
        trigger: "stream",
      });
    });

    it("does not fall back to markdown when wildcard flag is already false", () => {
      expect(
        shouldWorkspaceDesktopNotify({
          message: {
            ...baseStreamMessage,
            markdown: "heads up @everyone",
            hasWildcardMention: false,
          },
          viewport: baseViewport,
        }),
      ).toEqual({
        notify: false,
        trigger: "stream",
      });
    });

    it("notifies for followed topics", () => {
      expect(
        shouldWorkspaceDesktopNotify({
          message: {
            ...baseStreamMessage,
            topicNotificationMode: "follow",
          },
          viewport: baseViewport,
        }),
      ).toEqual({
        notify: true,
        trigger: "followed_topic",
      });
    });

    it("notifies for stream all_messages mode", () => {
      expect(
        shouldWorkspaceDesktopNotify({
          message: {
            ...baseStreamMessage,
            streamNotificationMode: "all_messages",
          },
          viewport: baseViewport,
        }),
      ).toEqual({
        notify: true,
        trigger: "stream",
      });
    });

    it("returns false for muted chats", () => {
      expect(
        shouldWorkspaceDesktopNotify({
          message: {
            ...baseStreamMessage,
            streamNotificationMode: "muted",
          },
          viewport: baseViewport,
        }),
      ).toEqual({
        notify: false,
        trigger: "stream",
      });
    });

    it("returns false when focused window already shows the message", () => {
      expect(
        shouldWorkspaceDesktopNotify({
          message: {
            kind: "dm",
            markdown: "hello",
            isOwn: false,
            read: false,
          },
          viewport: {
            windowFocused: true,
            isMessageOnScreen: true,
          },
        }),
      ).toEqual({
        notify: false,
        trigger: "dm",
      });
    });

    it("notifies when the app is unfocused and the message is offscreen", () => {
      expect(
        shouldWorkspaceDesktopNotify({
          message: {
            kind: "dm",
            markdown: "hello",
            isOwn: false,
            read: false,
          },
          viewport: {
            windowFocused: false,
            isMessageOnScreen: false,
          },
        }),
      ).toEqual({
        notify: true,
        trigger: "dm",
      });
    });
  });

  describe("classifyWorkspaceNotificationTrigger", () => {
    it("falls back to stream when no stronger workspace trigger is present", () => {
      expect(
        classifyWorkspaceNotificationTrigger({
          kind: "stream",
          markdown: "hello team",
          isOwn: false,
          read: false,
          streamNotificationMode: "mentions_only",
          topicNotificationMode: "default",
        }),
      ).toBe("stream");
    });

    it("still falls back to markdown parsing when precomputed flags are absent", () => {
      expect(
        classifyWorkspaceNotificationTrigger({
          kind: "stream",
          markdown: "heads up @channel",
          isOwn: false,
          read: false,
          streamNotificationMode: "mentions_only",
          topicNotificationMode: "default",
        }),
      ).toBe("wildcard_mention");
    });
  });
});
