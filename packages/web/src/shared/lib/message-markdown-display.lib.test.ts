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

  it("renders unicode emoji from shortcode", () => {
    const html = messageBodyToUnsanitizedDisplayHtml("Hi :smile:");
    expect(html).toContain("😄");
    expect(html).not.toContain(":smile:");
  });

  it("resolves frequently used zulip-style shortcodes from emojibase dataset", () => {
    const html = messageBodyToUnsanitizedDisplayHtml("A :open_mouth: B :+1:");
    expect(html).toContain("😮");
    expect(html).toContain("👍");
    expect(html).not.toContain(":open_mouth:");
    expect(html).not.toContain(":+1:");
  });

  it("resolves zulip alias overrides for unicode emoji shortcodes", () => {
    const html = messageBodyToUnsanitizedDisplayHtml("A :working_on_it: B :hammer_and_wrench:");
    expect(html).toContain("🛠");
    expect(html).not.toContain(":working_on_it:");
    expect(html).not.toContain(":hammer_and_wrench:");
  });

  it("renders custom emoji shortcode as inline image when resolver returns URL", () => {
    const html = messageBodyToUnsanitizedDisplayHtml("Hi :party_parrot:", {
      resolveCustomEmojiShortcodeImageUrl: (shortcode) =>
        shortcode === "party_parrot" ? "https://cdn.example.com/parrot.png" : undefined,
    });
    expect(html).toContain('class="message-inline-emoji"');
    expect(html).toContain('src="https://cdn.example.com/parrot.png"');
    expect(html).toContain('alt=":party_parrot:"');
    expect(html).toContain('title=":party_parrot:"');
  });

  it("leaves unknown emoji shortcode as plain text", () => {
    const html = messageBodyToUnsanitizedDisplayHtml("Hi :definitely_unknown_shortcode:");
    expect(html).toContain(":definitely_unknown_shortcode:");
  });

  it("does not replace shortcode inside inline code or fenced code", () => {
    const html = messageBodyToUnsanitizedDisplayHtml(
      "Inline `:smile:` and block:\n```txt\n:smile:\n```\nOutside :smile:",
    );
    expect(html).toContain("<code>:smile:</code>");
    expect(html).toMatch(/<pre><code[^>]*>:smile:\n<\/code><\/pre>/);
    expect(html).toContain("Outside 😄");
  });

  it("renders mentions and emoji shortcodes together", () => {
    const html = messageBodyToUnsanitizedDisplayHtml("Hello @**Octane** :smile:", {
      resolveUserMention: (name) => (name === "Octane" ? 99 : null),
    });
    expect(html).toContain('class="user-mention"');
    expect(html).toContain('data-user-id="99"');
    expect(html).toContain("😄");
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
