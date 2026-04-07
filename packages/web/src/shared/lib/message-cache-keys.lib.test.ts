import { describe, expect, it } from "vitest";
import { chatKeyFromContext, normalizeStreamTopicForMessageCache } from "./message-cache-keys.lib";

describe("message-cache-keys.lib", () => {
  describe("normalizeStreamTopicForMessageCache", () => {
    it("maps empty and whitespace to general", () => {
      expect(normalizeStreamTopicForMessageCache("")).toBe("general");
      expect(normalizeStreamTopicForMessageCache("   ")).toBe("general");
    });

    it("preserves non-empty topics", () => {
      expect(normalizeStreamTopicForMessageCache("design")).toBe("design");
      expect(normalizeStreamTopicForMessageCache("  rust  ")).toBe("rust");
    });
  });

  describe("chatKeyFromContext", () => {
    it("uses general for empty topic so keys match chatKeyFromRawMessage", () => {
      expect(
        chatKeyFromContext({
          type: "stream",
          streamId: 42,
          topic: "",
        }),
      ).toBe("stream:42:general");
    });

    it("builds dm key unchanged", () => {
      expect(chatKeyFromContext({ type: "dm", dmKey: "1,2" })).toBe("dm:1,2");
    });
  });
});
