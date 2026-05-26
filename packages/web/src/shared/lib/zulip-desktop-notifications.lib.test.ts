import { describe, expect, it } from "vitest";
import {
  classifyNotificationTrigger,
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

  describe("shouldDesktopNotify", () => {
    it("skips on-screen messages in current chat", () => {
      const result = shouldDesktopNotify({
        message: { type: "private", isTopicFollowed: false },
        viewport: { ...baseViewport, isOnScreenInCurrentChat: true },
        settings: DEFAULT_ZULIP_NOTIFICATION_SETTINGS,
      });
      expect(result.notify).toBe(false);
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
