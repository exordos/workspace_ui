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

  it("renders inline spoiler syntax into dedicated spoiler span", () => {
    // Assert markup format expected by the bubble click handler.
    const html = renderMarkdownFallbackHtml("Hello ||secret||");
    expect(html).toContain('class="inline-spoiler"');
    expect(html).toContain('data-inline-spoiler="true"');
    expect(html).toContain("secret");
  });

  it("renders zulip fenced spoiler markdown with block header/content structure", () => {
    const html = renderMarkdownFallbackHtml("```spoiler Header\ninside text\n```");
    expect(html).toContain('class="spoiler-block"');
    expect(html).toContain('class="spoiler-header"');
    expect(html).toContain('class="spoiler-content"');
    expect(html).toContain("Header");
    expect(html).toContain("inside text");
  });

  it("uses default spoiler header when fenced spoiler header is empty", () => {
    const html = renderMarkdownFallbackHtml("```spoiler\ninside text\n```");
    expect(html).toContain('class="spoiler-header"');
    expect(html).toContain("Spoiler");
    expect(html).toContain("inside text");
  });
});

describe("messageBodyToUnsanitizedDisplayHtml + Zulip mentions", () => {
  it("injects user-mention span for @**Name** when resolver matches", () => {
    const html = messageBodyToUnsanitizedDisplayHtml("Hello @**John**", {
      resolveUserMention: (name) => (name === "John" ? 99 : null),
    });
    expect(html).toContain('class="user-mention"');
    expect(html).toContain('data-user-id="99"');
    expect(html).toContain(">@John<");
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

  it("uses renderedContent instead of compiling markdown_source when content is already HTML", () => {
    const rendered = "<p><strong>Hello</strong></p>";
    const html = messageBodyToUnsanitizedDisplayHtml("**Hello**", {
      treatAsMarkdown: true,
      renderedContent: rendered,
    });
    expect(html).toBe(rendered);
  });

  it("keeps zulip spoiler block structure for bubble accordion UI", () => {
    const html = messageBodyToUnsanitizedDisplayHtml(
      [
        '<div class="spoiler-block">',
        '<div class="spoiler-header">Top Secret Header</div>',
        '<div class="spoiler-content"><p>Hidden payload</p></div>',
        "</div>",
      ].join(""),
    );
    expect(html).toContain('class="spoiler-block"');
    expect(html).toContain('class="spoiler-header"');
    expect(html).toContain('class="spoiler-content"');
    expect(html).toContain("Hidden payload");
    expect(html).toContain("Top Secret Header");
  });

  it("does not normalize pre-rendered HTML before the sanitize boundary", () => {
    const html = messageBodyToUnsanitizedDisplayHtml(
      [
        '<div class="spoiler-block">',
        '<div class="spoiler-content"><p>Hidden payload</p></div>',
        "</div>",
      ].join(""),
    );
    expect(html).not.toContain('class="spoiler-header"');
  });

  it("injects user-mention from reply silent @_**Name|id** without resolver", () => {
    const html = messageBodyToUnsanitizedDisplayHtml("Hello @_**Doublek|507** [link](https://x)", {
      resolveUserMention: () => null,
    });
    expect(html).toContain('data-user-id="507"');
    expect(html).toContain(">@Doublek<");
    expect(html).not.toContain("**");
  });

  it("renders resolved zulip stream reference as plain text", () => {
    const html = messageBodyToUnsanitizedDisplayHtml("#**Engineering**", {
      resolveStreamByName: (streamName) =>
        streamName === "Engineering" ? { streamId: 10, streamName } : null,
    });
    expect(html).toContain("#Engineering");
    expect(html).not.toContain("<a");
  });

  it("renders resolved zulip stream topic reference as plain text", () => {
    const html = messageBodyToUnsanitizedDisplayHtml("#**Engineering>Bugs**", {
      resolveStreamByName: (streamName) =>
        streamName === "Engineering" ? { streamId: 10, streamName } : null,
    });
    expect(html).toContain("#Engineering&gt;Bugs");
    expect(html).not.toContain("<a");
  });

  it("renders resolved zulip stream topic message reference as plain text", () => {
    const html = messageBodyToUnsanitizedDisplayHtml("#**Engineering>Bugs@12345**", {
      resolveStreamByName: (streamName) =>
        streamName === "Engineering" ? { streamId: 10, streamName } : null,
    });
    expect(html).toContain("#Engineering&gt;Bugs@12345");
    expect(html).not.toContain("<a");
  });

  it("renders an unresolved zulip message reference as plain text", () => {
    const html = messageBodyToUnsanitizedDisplayHtml("#**Unknown>Bugs@12345**", {
      resolveStreamByName: () => null,
    });
    expect(html).toContain("#Unknown&gt;Bugs@12345");
    expect(html).not.toContain("<a");
  });

  it("renders unresolved zulip stream reference as plain text", () => {
    const html = messageBodyToUnsanitizedDisplayHtml("#**Unknown**", {
      resolveStreamByName: () => null,
    });
    expect(html).toContain("#Unknown");
    expect(html).not.toContain("<a");
  });

  it("renders unresolved zulip stream topic reference as plain text", () => {
    const html = messageBodyToUnsanitizedDisplayHtml("#**Unknown>Bugs**", {
      resolveStreamByName: () => null,
    });
    expect(html).toContain("#Unknown&gt;Bugs");
    expect(html).not.toContain("<a");
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
