import { describe, expect, it } from "vitest";
import {
  resolveStreamAllMessagesAudibleEnabled,
  resolveStreamAllMessagesNotifyEnabled,
} from "./stream-notification-resolve.lib";

describe("stream-notification-resolve", () => {
  describe("resolveStreamAllMessagesNotifyEnabled", () => {
    it("returns true when per-stream override is true", () => {
      expect(resolveStreamAllMessagesNotifyEnabled(true, false)).toBe(true);
    });

    it("returns false when per-stream override is false", () => {
      expect(resolveStreamAllMessagesNotifyEnabled(false, true)).toBe(false);
    });

    it("inherits global when per-stream is null or undefined", () => {
      expect(resolveStreamAllMessagesNotifyEnabled(null, true)).toBe(true);
      expect(resolveStreamAllMessagesNotifyEnabled(undefined, false)).toBe(false);
    });
  });

  describe("resolveStreamAllMessagesAudibleEnabled", () => {
    it("returns true when per-stream override is true", () => {
      expect(resolveStreamAllMessagesAudibleEnabled(true, false)).toBe(true);
    });

    it("returns false when per-stream override is false", () => {
      expect(resolveStreamAllMessagesAudibleEnabled(false, true)).toBe(false);
    });

    it("inherits global when per-stream is null or undefined", () => {
      expect(resolveStreamAllMessagesAudibleEnabled(null, true)).toBe(true);
      expect(resolveStreamAllMessagesAudibleEnabled(undefined, false)).toBe(false);
    });
  });
});
