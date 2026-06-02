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

describe("zulip-desktop-notifications", () => {
  describe("classifyNotificationTrigger", () => {
    it("classifies DMs", () => {
      expect(classifyNotificationTrigger({ type: "private", isTopicFollowed: false })).toBe("dm");
    });

    it("classifies mentions before stream", () => {
      expect(
        classifyNotificationTrigger({
          type: "stream",
          flags: ["mentioned"],
          isTopicFollowed: false,
        }),
      ).toBe("mention");
    });

    it("classifies followed topics", () => {
      expect(
        classifyNotificationTrigger({
          type: "stream",
          flags: [],
          isTopicFollowed: true,
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
    it("skips on-screen messages in current chat when tab is focused", () => {
      const result = shouldDesktopNotify({
        message: { type: "private", isTopicFollowed: false },
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
        message: { type: "private", isTopicFollowed: false },
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
        message: { type: "private", isTopicFollowed: false },
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
        message: { type: "private", isTopicFollowed: false },
        viewport: baseViewport,
        settings: DEFAULT_ZULIP_NOTIFICATION_SETTINGS,
      });
      expect(result.notify).toBe(true);
      expect(result.playSound).toBe(true);
    });

    it("skips stream messages when stream desktop disabled", () => {
      const result = shouldDesktopNotify({
        message: { type: "stream", flags: [], isTopicFollowed: false },
        viewport: baseViewport,
        settings: DEFAULT_ZULIP_NOTIFICATION_SETTINGS,
      });
      expect(result.notify).toBe(false);
    });

    it("notifies for stream when stream desktop enabled", () => {
      const result = shouldDesktopNotify({
        message: { type: "stream", flags: [], isTopicFollowed: false },
        viewport: baseViewport,
        settings: {
          ...DEFAULT_ZULIP_NOTIFICATION_SETTINGS,
          enableStreamDesktopNotifications: true,
        },
      });
      expect(result.notify).toBe(true);
    });

    it("skips muted stream messages", () => {
      const result = shouldDesktopNotify({
        message: { type: "stream", flags: [], isTopicFollowed: false },
        viewport: { ...baseViewport, isMuted: true },
        settings: {
          ...DEFAULT_ZULIP_NOTIFICATION_SETTINGS,
          enableStreamDesktopNotifications: true,
        },
      });
      expect(result.notify).toBe(false);
    });
  });
});
