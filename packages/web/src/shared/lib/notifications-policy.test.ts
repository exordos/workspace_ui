import { describe, expect, it } from "vitest";
import { shouldNotify } from "./notifications-policy";

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
});
