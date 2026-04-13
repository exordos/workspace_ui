import { describe, expect, it } from "vitest";
import { resolveReplyQuoteContent } from "./chat-reply-quote.lib";

describe("resolveReplyQuoteContent", () => {
  it("returns trimmed selection when non-empty", () => {
    expect(
      resolveReplyQuoteContent({ content: "<p>x</p>", markdown_source: "x" }, "  picked  "),
    ).toBe("picked");
  });

  it("prefers markdown_source over HTML when there is no selection", () => {
    expect(
      resolveReplyQuoteContent({
        content: "<p><strong>Hi</strong></p>",
        markdown_source: "**Hi**",
      }),
    ).toBe("**Hi**");
  });

  it("strips HTML when markdown_source is missing", () => {
    expect(
      resolveReplyQuoteContent({
        content: "<p>Plain <em>text</em></p>",
      }),
    ).toBe("Plain text");
  });

  it("ignores blank markdown_source and falls back to stripped HTML", () => {
    expect(
      resolveReplyQuoteContent({
        content: "<p>ok</p>",
        markdown_source: "   ",
      }),
    ).toBe("ok");
  });

  it("strips HTML when markdown_source wrongly holds rendered HTML", () => {
    expect(
      resolveReplyQuoteContent({
        content: "<p>ывпывп</p>",
        markdown_source: "<p>ывпывп</p>",
      }),
    ).toBe("ывпывп");
  });

  it("keeps Zulip angle-bracket link markdown when used as markdown_source", () => {
    expect(
      resolveReplyQuoteContent({
        content: "<p>x</p>",
        markdown_source: "<https://example.com/path>",
      }),
    ).toBe("<https://example.com/path>");
  });
});
