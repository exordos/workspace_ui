import { describe, expect, it } from "vitest";
import {
  isLikelyRenderedMessageHtml,
  plainTextPreviewFromMessageBody,
  renderMarkdownFallbackHtml,
} from "./message-markdown-display.lib";

describe("isLikelyRenderedMessageHtml", () => {
  it("returns false for markdown text", () => {
    expect(isLikelyRenderedMessageHtml("**hi**")).toBe(false);
  });

  it("returns true for paragraph HTML", () => {
    expect(isLikelyRenderedMessageHtml("<p>hello</p>")).toBe(true);
  });

  it("returns false for Zulip angle-bracket link markdown", () => {
    expect(isLikelyRenderedMessageHtml("<https://example.com>")).toBe(false);
  });
});

describe("renderMarkdownFallbackHtml", () => {
  it("wraps bold markdown in strong", () => {
    const html = renderMarkdownFallbackHtml("**x**");
    expect(html).toContain("strong");
    expect(html).toContain("x");
  });
});

describe("plainTextPreviewFromMessageBody", () => {
  it("strips HTML when body is rendered HTML", () => {
    expect(plainTextPreviewFromMessageBody("<p>ab</p>")).toBe("ab");
  });

  it("derives plain text from markdown", () => {
    expect(plainTextPreviewFromMessageBody("Hello **world**")).toContain("Hello");
    expect(plainTextPreviewFromMessageBody("Hello **world**")).toContain("world");
  });
});
