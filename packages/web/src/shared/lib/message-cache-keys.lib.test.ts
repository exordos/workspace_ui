import { describe, expect, it } from "vitest";
import { chatKeyFromContext, normalizeStreamTopicForMessageCache } from "./message-cache-keys.lib";

const STREAM_UUID_42 = "00000000-0000-4000-8000-000000000042";

describe("message-cache-keys.lib", () => {
  describe("normalizeStreamTopicForMessageCache", () => {
    it("keeps empty and whitespace as empty identity topic", () => {
      expect(normalizeStreamTopicForMessageCache("")).toBe("");
      expect(normalizeStreamTopicForMessageCache("   ")).toBe("");
    });

    it("preserves non-empty topics", () => {
      expect(normalizeStreamTopicForMessageCache("design")).toBe("design");
      expect(normalizeStreamTopicForMessageCache("  rust  ")).toBe("rust");
    });
  });

  describe("chatKeyFromContext", () => {
    it("keeps empty topic distinct from literal general", () => {
      expect(
        chatKeyFromContext({
          type: "stream",
          streamId: STREAM_UUID_42,
          topic: "",
        }),
      ).toBe(`stream:${STREAM_UUID_42}:`);
      expect(
        chatKeyFromContext({
          type: "stream",
          streamId: STREAM_UUID_42,
          topic: "general",
        }),
      ).toBe(`stream:${STREAM_UUID_42}:general`);
    });

    it("builds dm key unchanged", () => {
      expect(chatKeyFromContext({ type: "dm", dmKey: "1,2" })).toBe("dm:1,2");
    });
  });
});
