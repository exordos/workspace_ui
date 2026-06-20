import { describe, expect, it } from "vitest";
import {
  classifyNotificationTrigger,
  isMessageOffscreenOrAppUnfocused,
  shouldDesktopNotify,
} from "./zulip-desktop-notifications.lib";
import { DEFAULT_ZULIP_NOTIFICATION_SETTINGS } from "./zulip-notification-settings.lib";

const baseViewport = {
  isFromSelf: false,
  isOnScreenInCurrentChat: false,
  isMuted: false,
  windowFocused: false,
  windowHidden: false,
};

const streamMessageDefaults = {
  type: "stream" as const,
  flags: [] as string[],
  isTopicFollowed: false,
  streamAllMessagesNotifyEnabled: false,
  streamAllMessagesAudibleEnabled: false,
};

describe("zulip-desktop-notifications", () => {
  describe("classifyNotificationTrigger", () => {
    it("classifies DMs", () => {
      expect(
        classifyNotificationTrigger({
          type: "private",
          isTopicFollowed: false,
          streamAllMessagesNotifyEnabled: false,
          streamAllMessagesAudibleEnabled: false,
        }),
      ).toBe("dm");
    });

    it("classifies mentions before stream", () => {
      expect(
        classifyNotificationTrigger({
          type: "stream",
          flags: ["mentioned"],
          isTopicFollowed: false,
          streamAllMessagesNotifyEnabled: false,
          streamAllMessagesAudibleEnabled: false,
        }),
      ).toBe("mention");
    });

    it("classifies followed topics", () => {
      expect(
        classifyNotificationTrigger({
          type: "stream",
          flags: [],
          isTopicFollowed: true,
          streamAllMessagesNotifyEnabled: false,
          streamAllMessagesAudibleEnabled: false,
        }),
      ).toBe("followed_topic");
    });
  });

  describe("isMessageOffscreenOrAppUnfocused", () => {
    it("is true when tab hidden even if message is in open chat", () => {
      expect(
        isMessageOffscreenOrAppUnfocused({
          isFromSelf: false,
          isOnScreenInCurrentChat: true,
          isMuted: false,
          windowFocused: false,
          windowHidden: true,
        }),
      ).toBe(true);
    });

    it("is false when tab focused and message on screen in open chat", () => {
      expect(
        isMessageOffscreenOrAppUnfocused({
          isFromSelf: false,
          isOnScreenInCurrentChat: true,
          isMuted: false,
          windowFocused: true,
          windowHidden: false,
        }),
      ).toBe(false);
    });
  });

  describe("shouldDesktopNotify", () => {
    const dmMessage = {
      type: "private" as const,
      isTopicFollowed: false,
      streamAllMessagesNotifyEnabled: false,
      streamAllMessagesAudibleEnabled: false,
    };

    it("skips on-screen messages in current chat when tab is focused", () => {
      const result = shouldDesktopNotify({
        message: dmMessage,
        viewport: {
          ...baseViewport,
          isOnScreenInCurrentChat: true,
          windowFocused: true,
          windowHidden: false,
        },
        settings: DEFAULT_ZULIP_NOTIFICATION_SETTINGS,
      });
      expect(result.notify).toBe(false);
      expect(result.playSound).toBe(false);
    });

    it("plays sound for DM in open chat when tab is hidden", () => {
      const result = shouldDesktopNotify({
        message: dmMessage,
        viewport: {
          ...baseViewport,
          isOnScreenInCurrentChat: true,
          windowFocused: false,
          windowHidden: true,
        },
        settings: DEFAULT_ZULIP_NOTIFICATION_SETTINGS,
      });
      expect(result.notify).toBe(true);
      expect(result.playSound).toBe(true);
    });

    it("plays sound for DM in open chat when window lost focus but tab visible", () => {
      const result = shouldDesktopNotify({
        message: dmMessage,
        viewport: {
          ...baseViewport,
          isOnScreenInCurrentChat: true,
          windowFocused: false,
          windowHidden: false,
        },
        settings: DEFAULT_ZULIP_NOTIFICATION_SETTINGS,
      });
      expect(result.playSound).toBe(true);
    });

    it("notifies for DMs when desktop notifications enabled", () => {
      const result = shouldDesktopNotify({
        message: dmMessage,
        viewport: baseViewport,
        settings: DEFAULT_ZULIP_NOTIFICATION_SETTINGS,
      });
      expect(result.notify).toBe(true);
      expect(result.playSound).toBe(true);
    });

    it("skips plain stream messages when per-channel all-messages notify is off", () => {
      const result = shouldDesktopNotify({
        message: streamMessageDefaults,
        viewport: baseViewport,
        settings: DEFAULT_ZULIP_NOTIFICATION_SETTINGS,
      });
      expect(result.notify).toBe(false);
    });

    it("notifies for plain stream when per-channel all-messages notify is on", () => {
      const result = shouldDesktopNotify({
        message: {
          ...streamMessageDefaults,
          streamAllMessagesNotifyEnabled: true,
          streamAllMessagesAudibleEnabled: true,
        },
        viewport: baseViewport,
        settings: DEFAULT_ZULIP_NOTIFICATION_SETTINGS,
      });
      expect(result.notify).toBe(true);
      expect(result.playSound).toBe(true);
    });

    it("notifies for stream mention when all-messages notify is off", () => {
      const result = shouldDesktopNotify({
        message: {
          ...streamMessageDefaults,
          flags: ["mentioned"],
        },
        viewport: baseViewport,
        settings: DEFAULT_ZULIP_NOTIFICATION_SETTINGS,
      });
      expect(result.notify).toBe(true);
      expect(result.trigger).toBe("mention");
    });

    it("skips muted stream messages including mentions", () => {
      const result = shouldDesktopNotify({
        message: {
          ...streamMessageDefaults,
          flags: ["mentioned"],
          streamAllMessagesNotifyEnabled: true,
        },
        viewport: { ...baseViewport, isMuted: true },
        settings: DEFAULT_ZULIP_NOTIFICATION_SETTINGS,
      });
      expect(result.notify).toBe(false);
    });

    it("inherits global stream desktop via resolved flag", () => {
      const result = shouldDesktopNotify({
        message: {
          ...streamMessageDefaults,
          streamAllMessagesNotifyEnabled: true,
          streamAllMessagesAudibleEnabled: true,
        },
        viewport: baseViewport,
        settings: {
          ...DEFAULT_ZULIP_NOTIFICATION_SETTINGS,
          enableStreamDesktopNotifications: false,
        },
      });
      expect(result.notify).toBe(true);
    });
  });
});
