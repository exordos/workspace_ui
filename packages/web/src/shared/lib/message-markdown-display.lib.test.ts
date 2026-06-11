import { describe, expect, it } from "vitest";
import {
  isLikelyRenderedMessageHtml,
  messageBodyToUnsanitizedDisplayHtml,
  plainTextPreviewFromMessageBody,
  renderMarkdownFallbackHtml,
} from "./message-markdown-display.lib";
import { prepareProtectedMessageHtml } from "./protected-message-media";

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
});

function renderPreparedMessageHtml(
  body: string,
  options?: {
    resolveUserMention?: (displayName: string) => number | null;
    resolveCustomEmojiShortcodeImageUrl?: (shortcode: string) => string | undefined;
    treatAsMarkdown?: boolean;
  },
): string {
  const raw = messageBodyToUnsanitizedDisplayHtml(body, {
    resolveUserMention: options?.resolveUserMention,
    treatAsMarkdown: options?.treatAsMarkdown,
  });
  return prepareProtectedMessageHtml(raw, "https://sys.example.com/workspace/v1", {
    resolveCustomEmojiShortcodeImageUrl: options?.resolveCustomEmojiShortcodeImageUrl,
  });
}

describe("prepareProtectedMessageHtml message rendering pipeline", () => {
  it("renders unicode emoji from shortcode", () => {
    const html = renderPreparedMessageHtml("Hi :smile:");
    expect(html).toContain("😄");
    expect(html).not.toContain(":smile:");
  });

  it("resolves frequently used zulip-style shortcodes from emojibase dataset", () => {
    const html = renderPreparedMessageHtml("A :open_mouth: B :+1:");
    expect(html).toContain("😮");
    expect(html).toContain("👍");
    expect(html).not.toContain(":open_mouth:");
    expect(html).not.toContain(":+1:");
  });

  it("resolves zulip alias overrides for unicode emoji shortcodes", () => {
    const html = renderPreparedMessageHtml("A :working_on_it: B :hammer_and_wrench:");
    expect(html).toContain("🛠");
    expect(html).not.toContain(":working_on_it:");
    expect(html).not.toContain(":hammer_and_wrench:");
  });

  it("renders custom emoji shortcode as inline image when resolver returns URL", () => {
    const html = renderPreparedMessageHtml("Hi :party_parrot:", {
      resolveCustomEmojiShortcodeImageUrl: (shortcode) =>
        shortcode === "party_parrot" ? "https://cdn.example.com/parrot.png" : undefined,
    });
    expect(html).toContain('class="message-inline-emoji"');
    expect(html).toContain('src="https://cdn.example.com/parrot.png"');
    expect(html).toContain('alt=":party_parrot:"');
    expect(html).toContain('title=":party_parrot:"');
  });

  it("leaves unknown emoji shortcode as plain text", () => {
    const html = renderPreparedMessageHtml("Hi :definitely_unknown_shortcode:");
    expect(html).toContain(":definitely_unknown_shortcode:");
  });

  it("does not replace shortcode inside inline code or fenced code", () => {
    const html = renderPreparedMessageHtml(
      "Inline `:smile:` and block:\n```txt\n:smile:\n```\nOutside :smile:",
    );
    expect(html).toContain("<code>:smile:</code>");
    expect(html).toMatch(/<pre><code[^>]*>:smile:\n<\/code><\/pre>/);
    expect(html).toContain("Outside 😄");
  });

  it("does not parse spoiler markers inside inline/fenced code", () => {
    // Markers inside code segments must remain literal text.
    // Spoiler conversion applies only to plain text outside code.
    const html = renderPreparedMessageHtml(
      "Inline `||keep||` and block:\n```txt\n||stay||\n```\nOutside ||reveal||",
    );
    expect(html).toContain("<code>||keep||</code>");
    expect(html).toMatch(/<pre><code[^>]*>\|\|stay\|\|\n<\/code><\/pre>/);
    expect(html).toContain('class="inline-spoiler"');
    expect(html).toContain(">reveal<");
  });

  it("renders mentions and emoji shortcodes together", () => {
    const html = renderPreparedMessageHtml("Hello @**John** :smile:", {
      resolveUserMention: (name) => (name === "John" ? 99 : null),
    });
    expect(html).toContain('class="user-mention"');
    expect(html).toContain('data-user-id="99"');
    expect(html).toContain("😄");
  });

  it("does not add a second img when Zulip HTML already has message_inline_image", () => {
    const zulipHtml = [
      '<p><a href="/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png">image.png</a></p>',
      '<div class="message_inline_image">',
      '<a href="/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png">',
      '<img src="/user_uploads/thumbnail/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png/840x560.webp" alt="image.png">',
      "</a></div>",
    ].join("");
    const html = renderPreparedMessageHtml(zulipHtml);
    const imgCount = (html.match(/<img\b/gi) ?? []).length;
    expect(imgCount).toBe(1);
    expect(html).toContain("message_inline_image");
    expect(html).toContain("image.png</a>");
  });

  it("inlines user_upload image links as protected preview images", () => {
    const html = renderPreparedMessageHtml(
      "[image.png](/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png)",
    );
    expect(html).toContain(
      '<a href="https://sys.example.com/workspace/v1/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png"',
    );
    expect(html).toContain(
      'data-auth-src="https://sys.example.com/workspace/v1/user_uploads/thumbnail/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png/840x560.webp"',
    );
    expect(html).toContain('src="data:image/svg+xml');
    expect(html).not.toMatch(
      /<img[^>]*\ssrc="https:\/\/sys\.example\.com\/workspace\/v1\/user_uploads\//,
    );
  });

  it("keeps non-image user_upload links as regular links", () => {
    const html = renderPreparedMessageHtml("[report.pdf](/user_uploads/2/ff/report.pdf)");
    expect(html).toContain(
      '<a href="https://sys.example.com/workspace/v1/user_uploads/2/ff/report.pdf" target="_blank" rel="noopener noreferrer">report.pdf</a>',
    );
    expect(html).not.toContain("<img");
  });

  it("inlines user_upload video links into preview video elements", () => {
    const html = renderPreparedMessageHtml(
      "[clip.webm](/user_uploads/2/52/zVGJf8gDr9qR_a5GJff5PZS7/Screencast.webm)",
    );
    expect(html).toContain("<video");
    expect(html).not.toContain("</a>");
    expect(html).toContain('type="video/webm"');
  });

  it("inlines video links in pre-rendered Zulip HTML bodies", () => {
    const html = renderPreparedMessageHtml(
      '<p><a href="https://sys.example.com/user_uploads/2/52/id/file.webm" target="_blank">file.webm</a></p>',
    );
    expect(html).toContain("<video");
    expect(html).toContain('type="video/webm"');
    expect(html).not.toContain(">file.webm</a>");
  });

  it("renders Zulip quote fence as nested quote block with header mention", () => {
    const html = messageBodyToUnsanitizedDisplayHtml(
      "@_**Alice|42** [wrote](https://z.example.com/near/1):\n```quote\nHi there\n```\n\nMy reply",
      { resolveUserMention: () => null },
    );
    expect(html).toContain('class="zulip-quote-block"');
    expect(html).toContain('class="zulip-quote-header"');
    expect(html).toContain('class="zulip-quote-body"');
    expect(html).toContain('data-user-id="42"');
    expect(html).toContain("wrote");
    expect(html).toContain("Hi there");
    expect(html).toContain("My reply");
    expect(html).not.toContain("language-quote");
    expect(html).not.toContain("```quote");
  });

  it("preserves literal dollar replacement patterns inside markdown quote fences", () => {
    const html = messageBodyToUnsanitizedDisplayHtml(
      "@_**Alice|42** [wrote](https://z.example.com/near/1):\n```quote\n$& $` $' $$ $1\n```\n\nTail",
      { resolveUserMention: () => null },
    );

    expect(html).toContain('class="zulip-quote-body"');
    expect(html).toContain("<p>$&amp; $` $&#39; $$ $1</p>");
    expect(html).toContain("<br>Tail</p>");
  });

  it("wraps server-rendered blockquote after wrote header in zulip-quote-block", () => {
    const html = renderPreparedMessageHtml(
      [
        '<p><span class="user-mention" data-user-id="42">@Alice</span>',
        ' <a href="https://z.example.com/near/1">wrote</a>:</p>',
        "<blockquote><p>Quoted text</p></blockquote>",
        "<p>Reply</p>",
      ].join(""),
    );
    expect(html).toContain('class="zulip-quote-block"');
    expect(html).toContain('class="zulip-quote-header"');
    expect(html).toContain('class="zulip-quote-body"');
    expect(html).toContain("Quoted text");
  });

  it("inlines user_upload image inside server-rendered quote block instead of URL text", () => {
    const uploadPath = "/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png";
    const uploadUrl = `https://sys.example.com${uploadPath}`;
    const html = renderPreparedMessageHtml(
      [
        '<p><span class="user-mention" data-user-id="42">@Alice</span>',
        ' <a href="https://z.example.com/near/1">wrote</a>:</p>',
        `<blockquote><p><a href="${uploadPath}">${uploadUrl}</a></p></blockquote>`,
        '<div class="message_inline_image">',
        `<a href="${uploadPath}">`,
        `<img src="/user_uploads/thumbnail/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png/840x560.webp" alt="image.png">`,
        "</a></div>",
        "<p>Reply</p>",
      ].join(""),
    );

    expect(html).toContain('class="zulip-quote-block"');
    expect(html).toContain('class="zulip-quote-body"');
    expect(html).toContain(
      'data-auth-src="https://sys.example.com/workspace/v1/user_uploads/thumbnail/',
    );
    expect(html).toContain('class="message-media-preview"');
    expect(html).not.toMatch(new RegExp(`>${uploadUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<`));
    expect((html.match(/<img\b/gi) ?? []).length).toBe(1);
    expect(html).toMatch(/zulip-quote-body[\s\S]*message-media-preview/);
    expect(html).not.toMatch(/zulip-quote-block[\s\S]*message_inline_image/);
  });

  it("inlines user_upload image link inside markdown quote fence", () => {
    const uploadPath = "/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png";
    const html = renderPreparedMessageHtml(
      `@_**Alice|42** [wrote](https://z.example.com/near/1):\n\`\`\`quote\n[image.png](${uploadPath})\n\`\`\`\n\nMy reply`,
      { resolveUserMention: () => null },
    );

    expect(html).toContain('class="zulip-quote-body"');
    expect(html).toContain('class="message-media-preview"');
    expect(html).toContain(
      'data-auth-src="https://sys.example.com/workspace/v1/user_uploads/thumbnail/',
    );
    expect(html).toMatch(/zulip-quote-body[\s\S]*<img[^>]*message-media-preview/);
    expect((html.match(/<img\b/gi) ?? []).length).toBe(1);
  });

  it("fills missing/empty spoiler header with default label after sanitization", () => {
    const html = renderPreparedMessageHtml(
      [
        '<div class="spoiler-block">',
        '<div class="spoiler-content"><p>Hidden payload</p></div>',
        "</div>",
      ].join(""),
    );
    expect(html).toContain('class="spoiler-header"');
    expect(html).toContain("Spoiler");
  });

  it("keeps inline video through sanitize and protected-media preparation", () => {
    const safe = renderPreparedMessageHtml(
      "[Screencast.webm](/user_uploads/2/52/zVGJf8gDr9qR_a5GJff5PZS7/Screencast.webm)",
    );
    expect(safe).toContain("<video");
    expect(safe).toContain("data-auth-src");
    expect(safe).not.toContain('src="/user_uploads/');
  });

  it("renders raw markdown html tags as text instead of DOM elements", () => {
    const safe = renderPreparedMessageHtml('hi <img src=x onerror="alert(1)">', {
      treatAsMarkdown: true,
    });
    expect(safe).not.toContain("<img");
    expect(safe).toContain("&lt;img src=x onerror=");
  });

  it("renders leading raw html tags as text in markdown mode", () => {
    const safe = renderPreparedMessageHtml('<img src="x" onerror="alert(1)">', {
      treatAsMarkdown: true,
    });
    expect(safe).not.toContain("<img");
    expect(safe).toContain("&lt;img src=");
  });

  it("still sanitizes pre-rendered HTML bodies", () => {
    const safe = renderPreparedMessageHtml('<img src="x" onerror="alert(1)">');
    expect(safe).not.toContain("onerror");
    expect(safe).toContain("<img");
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
