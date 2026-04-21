import { describe, expect, it } from "vitest";
import {
  isLikelyRenderedMessageHtml,
  messageBodyToUnsanitizedDisplayHtml,
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

describe("messageBodyToUnsanitizedDisplayHtml + Zulip mentions", () => {
  it("injects user-mention span for @**Name** when resolver matches", () => {
    const html = messageBodyToUnsanitizedDisplayHtml("Hello @**Octane**", {
      resolveUserMention: (name) => (name === "Octane" ? 99 : null),
    });
    expect(html).toContain('class="user-mention"');
    expect(html).toContain('data-user-id="99"');
    expect(html).toContain(">@Octane<");
    expect(html).not.toContain("**");
    expect(html).not.toContain("@<strong>");
  });

  it("renders unresolved @**Name** as span without data-user-id", () => {
    const html = messageBodyToUnsanitizedDisplayHtml("Hello @**Ghost**", {
      resolveUserMention: () => null,
    });
    expect(html).toContain('class="user-mention"');
    expect(html).not.toContain("data-user-id");
    expect(html).toContain(">@Ghost<");
    expect(html).not.toContain("@<strong>");
  });

  it("does not double-process when body is already rendered HTML", () => {
    const html = messageBodyToUnsanitizedDisplayHtml(
      '<p><span class="user-mention" data-user-id="1">@x</span></p>',
      { resolveUserMention: () => 2 },
    );
    expect(html).toContain('data-user-id="1"');
  });

  it("injects user-mention from reply silent @_**Name|id** without resolver", () => {
    const html = messageBodyToUnsanitizedDisplayHtml("Hello @_**Doublek|507** [link](https://x)", {
      resolveUserMention: () => null,
    });
    expect(html).toContain('data-user-id="507"');
    expect(html).toContain(">@Doublek<");
    expect(html).not.toContain("**");
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
