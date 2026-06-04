import { describe, expect, it } from "vitest";
import {
  deriveStreamNotificationLevel,
  deriveTopicNotificationLevel,
  deriveTopicVisibilityLevel,
} from "./notification-level.lib";

describe("notification-level", () => {
  describe("deriveStreamNotificationLevel", () => {
    it("returns muted when stream is muted", () => {
      expect(deriveStreamNotificationLevel(true, true)).toBe("muted");
    });

    it("returns subscribed when desktop override is true", () => {
      expect(deriveStreamNotificationLevel(false, true)).toBe("subscribed");
    });

    it("returns default otherwise", () => {
      expect(deriveStreamNotificationLevel(false, false)).toBe("default");
      expect(deriveStreamNotificationLevel(false, null)).toBe("default");
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
