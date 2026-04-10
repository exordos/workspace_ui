import { describe, expect, it } from "vitest";
import { mockMessageFromGetMessageApiData, rawMessageToMockMessage } from "./zulip-message-map.lib";

describe("zulip-message-map.lib", () => {
  describe("rawMessageToMockMessage", () => {
    it("includes markdown_source when provided", () => {
      const result = rawMessageToMockMessage({
        id: 1,
        sender_id: 2,
        content: "<p>x</p>",
        timestamp: 1,
        markdown_source: "**x**",
      });
      expect(result.markdown_source).toBe("**x**");
      expect(result.content).toBe("<p>x</p>");
    });

    it("omits markdown_source when blank", () => {
      const result = rawMessageToMockMessage({
        id: 1,
        sender_id: 2,
        content: "<p>x</p>",
        timestamp: 1,
        markdown_source: "   ",
      });
      expect(result.markdown_source).toBeUndefined();
    });

    it("mirrors markdown body into markdown_source when API omits markdown_source", () => {
      const result = rawMessageToMockMessage({
        id: 1,
        sender_id: 2,
        content: "**bold**",
        timestamp: 1,
      });
      expect(result.content).toBe("**bold**");
      expect(result.markdown_source).toBe("**bold**");
    });

    it("does not set markdown_source for HTML-only body without API markdown_source", () => {
      const result = rawMessageToMockMessage({
        id: 1,
        sender_id: 2,
        content: "<p>hi</p>",
        timestamp: 1,
      });
      expect(result.markdown_source).toBeUndefined();
    });
  });

  describe("mockMessageFromGetMessageApiData", () => {
    it("parses nested message and raw_content", () => {
      const result = mockMessageFromGetMessageApiData({
        result: "success",
        raw_content: "**hi**",
        message: {
          id: 9,
          sender_id: 3,
          sender_full_name: "Bob",
          content: "<p>hi</p>",
          content_type: "text/html",
          timestamp: 100,
          subject: "t",
          type: "stream",
          stream_id: 5,
        },
      });
      expect(result).not.toBeNull();
      expect(result!.id).toBe(9);
      expect(result!.content).toBe("<p>hi</p>");
      expect(result!.markdown_source).toBe("**hi**");
    });

    it("uses message.content as markdown when content_type is text/x-markdown", () => {
      const result = mockMessageFromGetMessageApiData({
        result: "success",
        message: {
          id: 1,
          sender_id: 1,
          content: "*italic*",
          content_type: "text/x-markdown",
          timestamp: 0,
        },
      });
      expect(result!.markdown_source).toBe("*italic*");
    });

    it("returns null on error result", () => {
      expect(mockMessageFromGetMessageApiData({ result: "error" })).toBeNull();
    });

    it("supports flat message shape (tests / legacy)", () => {
      const result = mockMessageFromGetMessageApiData({
        result: "success",
        id: 100,
        sender_id: 42,
        content: "<p>hello</p>",
        timestamp: 1710000000,
        raw_content: "hello",
      });
      expect(result?.id).toBe(100);
      expect(result?.markdown_source).toBe("hello");
    });
  });
});
