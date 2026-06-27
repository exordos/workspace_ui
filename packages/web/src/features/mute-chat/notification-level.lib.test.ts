import { describe, expect, it } from "vitest";
import {
  deriveStreamNotificationLevel,
  deriveTopicNotificationLevel,
  deriveTopicVisibilityLevel,
} from "./notification-level.lib";

describe("notification-level", () => {
  describe("deriveStreamNotificationLevel", () => {
    it("maps muted notification mode", () => {
      expect(deriveStreamNotificationLevel("muted")).toBe("muted");
    });

    it("maps all_messages notification mode", () => {
      expect(deriveStreamNotificationLevel("all_messages")).toBe("subscribed");
    });

    it("maps mentions_only to default and missing mode to backend default", () => {
      expect(deriveStreamNotificationLevel("mentions_only")).toBe("default");
      expect(deriveStreamNotificationLevel()).toBe("subscribed");
    });
  });

  describe("deriveTopicVisibilityLevel", () => {
    it("maps explicit topic overrides to four policies", () => {
      expect(deriveTopicVisibilityLevel(true, false, false)).toBe("followed");
      expect(deriveTopicVisibilityLevel(false, true, false)).toBe("muted");
      expect(deriveTopicVisibilityLevel(false, false, true)).toBe("unmuted");
      expect(deriveTopicVisibilityLevel(false, false, false)).toBe("inherit");
    });
  });

  describe("deriveTopicNotificationLevel", () => {
    it("returns subscribed when topic is followed", () => {
      expect(deriveTopicNotificationLevel(true, false, false, true)).toBe("subscribed");
    });

    it("returns muted when topic or effective mute applies", () => {
      expect(deriveTopicNotificationLevel(false, true, false, false)).toBe("muted");
      expect(deriveTopicNotificationLevel(false, false, false, true)).toBe("muted");
    });

    it("returns default when topic is unmuted in a muted stream", () => {
      expect(deriveTopicNotificationLevel(false, false, true, true)).toBe("default");
    });

    it("returns default when no mute or follow override", () => {
      expect(deriveTopicNotificationLevel(false, false, false, false)).toBe("default");
    });
  });
});
