import { describe, expect, it } from "vitest";
import {
  parseWorkspaceStreamNotificationMode,
  resolveStreamAllMessagesAudibleEnabled,
  resolveStreamAllMessagesNotifyEnabled,
} from "./stream-notification-resolve.lib";

describe("stream-notification-resolve", () => {
  describe("resolveStreamAllMessagesNotifyEnabled", () => {
    it("returns true for all_messages", () => {
      expect(resolveStreamAllMessagesNotifyEnabled("all_messages", true)).toBe(true);
      expect(resolveStreamAllMessagesNotifyEnabled("all_messages", false)).toBe(true);
    });

    it("returns false for mentions_only and muted", () => {
      expect(resolveStreamAllMessagesNotifyEnabled("mentions_only", true)).toBe(false);
      expect(resolveStreamAllMessagesNotifyEnabled("muted", true)).toBe(false);
    });
  });

  describe("resolveStreamAllMessagesAudibleEnabled", () => {
    it("returns true for all_messages", () => {
      expect(resolveStreamAllMessagesAudibleEnabled("all_messages", true)).toBe(true);
      expect(resolveStreamAllMessagesAudibleEnabled("all_messages", false)).toBe(true);
    });

    it("returns false for mentions_only and muted", () => {
      expect(resolveStreamAllMessagesAudibleEnabled("mentions_only", true)).toBe(false);
      expect(resolveStreamAllMessagesAudibleEnabled("muted", true)).toBe(false);
    });
  });

  describe("parseWorkspaceStreamNotificationMode", () => {
    it("accepts backend notification modes", () => {
      expect(parseWorkspaceStreamNotificationMode("all_messages")).toBe("all_messages");
      expect(parseWorkspaceStreamNotificationMode("mentions_only")).toBe("mentions_only");
      expect(parseWorkspaceStreamNotificationMode("muted")).toBe("muted");
      expect(parseWorkspaceStreamNotificationMode("desktop_notifications")).toBeNull();
    });
  });
});
