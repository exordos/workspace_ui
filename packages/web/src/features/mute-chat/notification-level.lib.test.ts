import { describe, expect, it } from "vitest";
import {
  deriveStreamNotificationLevel,
  deriveTopicNotificationLevel,
  deriveTopicVisibilityLevel,
  topicNotificationLevelToMode,
  topicVisibilityLevelToMode,
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
    it("maps topic notification modes to four UI levels", () => {
      expect(deriveTopicVisibilityLevel("follow")).toBe("followed");
      expect(deriveTopicVisibilityLevel("mute")).toBe("muted");
      expect(deriveTopicVisibilityLevel("unmute")).toBe("unmuted");
      expect(deriveTopicVisibilityLevel("default")).toBe("inherit");
    });
  });

  describe("deriveTopicNotificationLevel", () => {
    it("returns subscribed when topic is followed", () => {
      expect(deriveTopicNotificationLevel("follow", true)).toBe("subscribed");
    });

    it("returns muted when topic or effective mute applies", () => {
      expect(deriveTopicNotificationLevel("mute", false)).toBe("muted");
      expect(deriveTopicNotificationLevel("default", true)).toBe("muted");
    });

    it("returns default when topic is unmuted in a muted stream", () => {
      expect(deriveTopicNotificationLevel("unmute", true)).toBe("default");
    });

    it("returns default when no mute or follow override", () => {
      expect(deriveTopicNotificationLevel("default", false)).toBe("default");
    });
  });

  describe("topic mode mappers", () => {
    it("maps four-level UI to topic notification modes", () => {
      expect(topicVisibilityLevelToMode("inherit")).toBe("default");
      expect(topicVisibilityLevelToMode("muted")).toBe("mute");
      expect(topicVisibilityLevelToMode("unmuted")).toBe("unmute");
      expect(topicVisibilityLevelToMode("followed")).toBe("follow");
    });

    it("maps three-level UI to stream-aware topic notification modes", () => {
      expect(topicNotificationLevelToMode("muted", false)).toBe("mute");
      expect(topicNotificationLevelToMode("subscribed", false)).toBe("follow");
      expect(topicNotificationLevelToMode("default", false)).toBe("default");
      expect(topicNotificationLevelToMode("default", true)).toBe("unmute");
    });
  });
});
