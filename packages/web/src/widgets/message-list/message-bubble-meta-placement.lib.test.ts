import { describe, expect, it } from "vitest";
import { resolveMessageBubbleMetaPlacement } from "./message-bubble-meta-placement.lib";

function resolvePlacement(options: {
  content?: string;
  markdown_source?: string;
  hasReactions?: boolean;
  hasLinkPreviews?: boolean;
}) {
  return resolveMessageBubbleMetaPlacement({
    message: {
      content: options.content ?? "<p>Hello</p>",
      markdown_source: options.markdown_source,
    },
    hasReactions: options.hasReactions ?? false,
    hasLinkPreviews: options.hasLinkPreviews ?? false,
  });
}

describe("resolveMessageBubbleMetaPlacement", () => {
  it("uses inline placement for simple rendered text", () => {
    expect(resolvePlacement({ content: "<p>Hello</p>" })).toBe("inline");
  });

  it("uses inline placement for simple markdown text", () => {
    expect(resolvePlacement({ content: "Hello", markdown_source: "Hello" })).toBe("inline");
  });

  it("uses inline placement for simple markdown text with punctuation", () => {
    const markdown =
      "так сервер раздеплоили. сейчас досматриваю и вам отдам. пошло как всегда не по плану )";

    expect(
      resolvePlacement({
        content: markdown,
        markdown_source: markdown,
      }),
    ).toBe("inline");
  });

  it("uses inline placement for simple markdown text with exclamation marks", () => {
    expect(
      resolvePlacement({
        content: "ну наконец-то!",
        markdown_source: "ну наконец-то!",
      }),
    ).toBe("inline");
  });

  it("uses inline placement for raw html-like markdown text", () => {
    const markdown =
      "hi <img src=x onerror=\"window.__xss_test__={fired:true,ts:Date.now(),source:'message-render'}\">";

    expect(
      resolvePlacement({
        content: markdown,
        markdown_source: markdown,
      }),
    ).toBe("inline");
  });

  it("uses inline placement for raw html-like markdown text with assignments", () => {
    const markdown = "hi <img src=x onerror=\"window.__xss_test__='fired'\">";

    expect(
      resolvePlacement({
        content: markdown,
        markdown_source: markdown,
      }),
    ).toBe("inline");
  });

  it("keeps row placement when reactions are present", () => {
    expect(resolvePlacement({ content: "<p>Hello</p>", hasReactions: true })).toBe("row");
  });

  it("keeps row placement when link previews are present", () => {
    expect(resolvePlacement({ content: "<p>Hello</p>", hasLinkPreviews: true })).toBe("row");
  });

  it("uses inline placement for rendered user mentions in a text paragraph", () => {
    expect(
      resolvePlacement({
        content: '<p><span class="user-mention" data-user-id="42">@Sleep</span> hello</p>',
      }),
    ).toBe("inline");
  });

  it("uses inline placement for Zulip user mention markdown", () => {
    expect(
      resolvePlacement({
        content: "Hello @**Sleep**",
        markdown_source: "Hello @**Sleep**",
      }),
    ).toBe("inline");
  });

  it("uses inline placement when Zulip user mention starts the markdown message", () => {
    expect(
      resolvePlacement({
        content: "@**Sleep** hello",
        markdown_source: "@**Sleep** hello",
      }),
    ).toBe("inline");
  });

  it("uses inline placement for Zulip silent reply mention markdown", () => {
    expect(
      resolvePlacement({
        content: "Hello @_**Sleep|42**",
        markdown_source: "Hello @_**Sleep|42**",
      }),
    ).toBe("inline");
  });

  it("uses inline placement for simple markdown links without preview cards", () => {
    expect(
      resolvePlacement({
        content: "Read [docs](https://example.com/docs)",
        markdown_source: "Read [docs](https://example.com/docs)",
      }),
    ).toBe("inline");
  });

  it("uses inline placement for rendered text links without preview cards", () => {
    expect(
      resolvePlacement({
        content: '<p>Read <a href="https://example.com/docs">docs</a></p>',
      }),
    ).toBe("inline");
  });

  it("keeps row placement for markdown links when preview cards are visible", () => {
    expect(
      resolvePlacement({
        content: "Read [docs](https://example.com/docs)",
        markdown_source: "Read [docs](https://example.com/docs)",
        hasLinkPreviews: true,
      }),
    ).toBe("row");
  });

  it("keeps row placement for markdown image links", () => {
    expect(
      resolvePlacement({
        content: "![photo](https://example.com/photo.png)",
        markdown_source: "![photo](https://example.com/photo.png)",
      }),
    ).toBe("row");
  });

  it("uses inline placement for rendered group mentions in a text paragraph", () => {
    expect(
      resolvePlacement({
        content:
          '<p><span class="user-mention user-group-mention" data-user-id="*">@all</span> hello</p>',
      }),
    ).toBe("inline");
  });

  it("uses inline placement for Zulip reply quotes with simple reply text", () => {
    const markdown =
      "@_**Alice|42** [wrote](https://zulip.example.com/near/1):\n```quote\nQuoted text\n```\n\nMy reply";

    expect(
      resolvePlacement({
        content: markdown,
        markdown_source: markdown,
      }),
    ).toBe("inline");
  });

  it("uses inline placement for rendered Zulip reply quotes with simple reply text", () => {
    expect(
      resolvePlacement({
        content: [
          '<p><span class="user-mention" data-user-id="42">@Alice</span>',
          ' <a href="https://zulip.example.com/near/1">wrote</a>:</p>',
          "<blockquote><p>Quoted text</p></blockquote>",
          "<p>My reply</p>",
        ].join(""),
      }),
    ).toBe("inline");
  });

  it("does not treat content without markdown_source as Zulip quote markdown", () => {
    expect(
      resolvePlacement({
        content:
          "@_**Alice|42** [wrote](https://zulip.example.com/near/1):\n```quote\nQuoted text\n```\n\nMy <strong>reply</strong>",
      }),
    ).toBe("row");
  });

  it("keeps row placement for quote-only Zulip replies", () => {
    const markdown =
      "@_**Alice|42** [wrote](https://zulip.example.com/near/1):\n```quote\nQuoted text\n```";

    expect(
      resolvePlacement({
        content: markdown,
        markdown_source: markdown,
      }),
    ).toBe("row");
  });

  it("uses inline placement for Zulip reply quotes with simple link reply text", () => {
    const markdown =
      "@_**Alice|42** [wrote](https://zulip.example.com/near/1):\n```quote\nQuoted text\n```\n\n[link](https://example.com)";

    expect(
      resolvePlacement({
        content: markdown,
        markdown_source: markdown,
      }),
    ).toBe("inline");
  });

  it("keeps row placement for Zulip reply quotes with rich reply text", () => {
    const markdown =
      "@_**Alice|42** [wrote](https://zulip.example.com/near/1):\n```quote\nQuoted text\n```\n\n**important**";

    expect(
      resolvePlacement({
        content: markdown,
        markdown_source: markdown,
      }),
    ).toBe("row");
  });

  it("keeps row placement for non-mention inline html", () => {
    expect(resolvePlacement({ content: "<p>Hello <strong>Sleep</strong></p>" })).toBe("row");
  });

  it("keeps row placement for rich markdown", () => {
    expect(
      resolvePlacement({
        content: "**Hello**",
        markdown_source: "**Hello**",
      }),
    ).toBe("row");
  });
});
