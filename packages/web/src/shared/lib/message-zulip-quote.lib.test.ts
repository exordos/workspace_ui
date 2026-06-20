import { describe, expect, it } from "vitest";
import {
  findZulipQuoteFenceOpen,
  renderZulipQuoteBlocksInMarkdown,
  wrapWithZulipQuoteFence,
  ZULIP_QUOTE_HEADER_PATTERN,
} from "./message-zulip-quote.lib";

describe("findZulipQuoteFenceOpen", () => {
  it("finds a standard three-backtick quote fence", () => {
    const src = "```quote\nhello\n```";
    const match = findZulipQuoteFenceOpen(src);
    expect(match).not.toBeNull();
    expect(match?.backtickCount).toBe(3);
    expect(match?.innerContent).toBe("hello");
    expect(match?.raw).toBe("```quote\nhello\n```");
  });

  it("finds variable-length quote fences", () => {
    const src = "````quote\nnested ``` inside\n````";
    const match = findZulipQuoteFenceOpen(src);
    expect(match).not.toBeNull();
    expect(match?.backtickCount).toBe(4);
    expect(match?.innerContent).toBe("nested ``` inside");
  });

  it("returns null when no quote fence is present", () => {
    expect(findZulipQuoteFenceOpen("```python\ncode\n```")).toBeNull();
    expect(findZulipQuoteFenceOpen("plain text")).toBeNull();
  });
});

describe("wrapWithZulipQuoteFence", () => {
  it("uses three backticks for plain content", () => {
    const fence = wrapWithZulipQuoteFence("hello");
    expect(fence.open).toBe("```quote");
    expect(fence.close).toBe("```");
    expect(fence.backtickCount).toBe(3);
  });

  it("uses longer fences when content contains code fences", () => {
    const fence = wrapWithZulipQuoteFence("```quote\ninner\n```");
    expect(fence.backtickCount).toBe(4);
    expect(fence.open).toBe("````quote");
    expect(fence.close).toBe("````");
  });

  it("wraps content with open and close lines", () => {
    const fence = wrapWithZulipQuoteFence("text");
    expect(fence.wrap("text")).toBe("```quote\ntext\n```");
  });
});

describe("ZULIP_QUOTE_HEADER_PATTERN", () => {
  it("matches Zulip reply quote header with wrote link", () => {
    const line = "@_**Alice|42** [wrote](https://z.example.com/#narrow/dm/near/1):";
    expect(ZULIP_QUOTE_HEADER_PATTERN.test(line)).toBe(true);
  });

  it("matches header without wrote link", () => {
    expect(ZULIP_QUOTE_HEADER_PATTERN.test("@_**Bob|7**:")).toBe(true);
  });
});

describe("renderZulipQuoteBlocksInMarkdown", () => {
  const renderInnerPlain = (inner: string) => `<p>${inner}</p>`;
  const renderInnerRecursive = (inner: string): string =>
    renderZulipQuoteBlocksInMarkdown(inner, renderInnerRecursive);

  it("renders a single quote block with header and body", () => {
    const md =
      "@_**Alice|42** [wrote](https://z.example.com/near/1):\n```quote\nHi there\n```\n\nMy reply";
    const html = renderZulipQuoteBlocksInMarkdown(md, renderInnerPlain);
    expect(html).toContain('class="zulip-quote-block"');
    expect(html).toContain('class="zulip-quote-header"');
    expect(html).toContain('class="zulip-quote-body"');
    expect(html).toContain("@_**Alice|42**");
    expect(html).toContain("[wrote]");
    expect(html).toContain("<p>Hi there</p>");
    expect(html).toContain("My reply");
    expect(html).not.toContain("```quote");
  });

  it("renders quote without header when header line is absent", () => {
    const md = "```quote\nquoted only\n```";
    const html = renderZulipQuoteBlocksInMarkdown(md, renderInnerPlain);
    expect(html).toContain('class="zulip-quote-block"');
    expect(html).not.toContain('class="zulip-quote-header"');
    expect(html).toContain("<p>quoted only</p>");
  });

  it("renders nested quote blocks recursively", () => {
    const md = [
      "@_**Alice|1** [wrote](https://z.example.com/near/1):",
      "````quote",
      "@_**Bob|2** [wrote](https://z.example.com/near/2):",
      "```quote",
      "deepest",
      "```",
      "middle",
      "````",
      "My reply",
    ].join("\n");
    const html = renderZulipQuoteBlocksInMarkdown(md, renderInnerRecursive);
    const blocks = html.match(/class="zulip-quote-block"/g);
    expect(blocks?.length).toBe(2);
    expect(html).toContain("deepest");
    expect(html).toContain("middle");
    expect(html).toContain("My reply");
  });

  it("handles four-backtick fences for nested content with code blocks", () => {
    const md = "````quote\n```\ncode\n```\n````";
    const html = renderZulipQuoteBlocksInMarkdown(md, renderInnerPlain);
    expect(html).toContain('class="zulip-quote-block"');
    expect(html).not.toContain("````quote");
  });
});
