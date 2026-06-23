/**
 * Client-side message body display: detect Zulip-rendered HTML vs Markdown, render Markdown
 * with `marked` + syntax highlighting, produce plain-text previews.
 *
 * Used when GET /messages uses `apply_markdown=false` (body is Markdown) and for composer
 * preview fallback. Real-time events may still deliver rendered HTML — `isLikelyRenderedMessageHtml`
 * picks the safe path before `sanitizeHtml`.
 *
 * Usage:
 *   import {
 *     isLikelyRenderedMessageHtml,
 *     messageBodyToUnsanitizedDisplayHtml,
 *     plainTextPreviewFromMessageBody,
 *   } from "~/shared/lib/message-markdown-display.lib";
 */
import { Marked, type Token, type TokenizerAndRendererExtension, type Tokens } from "marked";
import { stripHtml } from "~/shared/lib/html";
import {
  injectZulipMentionPlaceholders,
  restoreZulipMentionPlaceholders,
} from "~/shared/lib/message-zulip-mentions.lib";
import { renderZulipQuoteBlocksInMarkdown } from "~/shared/lib/message-zulip-quote.lib";
import {
  createZulipStreamReferenceExtension,
  type ResolvedStreamReference,
} from "~/shared/lib/message-zulip-stream-ref.lib";

interface InlineSpoilerToken extends Tokens.Generic {
  type: "inline_spoiler";
  text: string;
  tokens: Token[];
}

interface ZulipBlockSpoilerToken extends Tokens.Generic {
  type: "zulip_block_spoiler";
  header: string;
  headerTokens: Token[];
  text: string;
  tokens: Token[];
}

const INLINE_SPOILER_TOKEN_TYPE = "inline_spoiler";
const ZULIP_BLOCK_SPOILER_TOKEN_TYPE = "zulip_block_spoiler";
const DEFAULT_ZULIP_SPOILER_HEADER = "Spoiler";
const QUOTE_PLACEHOLDER_START = "\uE100";
const QUOTE_PLACEHOLDER_END = "\uE101";

function escapeInlineHtmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface MarkedSpoilerRendererContext {
  parser: {
    parseInline: (tokens: Token[]) => string;
    parse: (tokens: Token[]) => string;
  };
}

function renderInlineSpoilerToken(this: MarkedSpoilerRendererContext, token: Token): string {
  const spoilerToken = token as InlineSpoilerToken;
  const inlineHtml = this.parser.parseInline(spoilerToken.tokens);
  return `<span class="inline-spoiler" data-inline-spoiler="true">${inlineHtml}</span>`;
}

function renderZulipBlockSpoilerToken(this: MarkedSpoilerRendererContext, token: Token): string {
  const spoilerToken = token as ZulipBlockSpoilerToken;
  const blockHtml = this.parser.parse(spoilerToken.tokens);
  const headerHtml = this.parser.parseInline(spoilerToken.headerTokens);
  return `<div class="spoiler-block"><div class="spoiler-header">${headerHtml}</div><div class="spoiler-content">${blockHtml}</div></div>`;
}

/** Bubble fallback: `||secret||` → inline spoiler element. */
const INLINE_SPOILER_EXTENSION: TokenizerAndRendererExtension = {
  level: "inline",
  name: INLINE_SPOILER_TOKEN_TYPE,
  start(src) {
    const index = src.indexOf("||");
    return index >= 0 ? index : undefined;
  },
  tokenizer(src) {
    if (!src.startsWith("||")) return undefined;
    const match = /^\|\|([\s\S]+?)\|\|/.exec(src);
    if (match == null) return undefined;
    const raw = match[0];
    const text = match[1] ?? "";
    return {
      type: INLINE_SPOILER_TOKEN_TYPE,
      raw,
      text,
      tokens: this.lexer.inlineTokens(text),
    };
  },
  renderer: renderInlineSpoilerToken,
};

/** Zulip block spoiler markdown → bubble accordion markup. */
const ZULIP_BLOCK_SPOILER_EXTENSION: TokenizerAndRendererExtension = {
  level: "block",
  name: ZULIP_BLOCK_SPOILER_TOKEN_TYPE,
  start(src) {
    const index = src.indexOf("```spoiler");
    return index >= 0 ? index : undefined;
  },
  tokenizer(src) {
    if (!src.startsWith("```spoiler")) return undefined;
    const match = /^```spoiler(?:[ \t]+([^\n`]*))?[ \t]*\n([\s\S]*?)\n```(?:\n|$)/.exec(src);
    if (match == null) return undefined;
    const raw = match[0];
    const header = (match[1] ?? "").trim();
    const text = match[2] ?? "";
    const headerMarkdown = header.length > 0 ? header : DEFAULT_ZULIP_SPOILER_HEADER;
    return {
      type: ZULIP_BLOCK_SPOILER_TOKEN_TYPE,
      raw,
      header,
      headerTokens: this.lexer.inlineTokens(headerMarkdown),
      text,
      tokens: this.lexer.blockTokens(text, []),
    };
  },
  childTokens: ["tokens", "headerTokens"],
  renderer: renderZulipBlockSpoilerToken,
};

function createMarkdownRenderer(
  options?: Pick<MessageBodyDisplayOptions, "resolveStreamByName">,
): Marked {
  return new Marked({
    extensions: [
      ZULIP_BLOCK_SPOILER_EXTENSION,
      INLINE_SPOILER_EXTENSION,
      createZulipStreamReferenceExtension(options?.resolveStreamByName),
    ],
    renderer: {
      html({ text }) {
        return escapeInlineHtmlText(text);
      },
    },
  });
}

/** True when the string looks like HTML from Zulip, not raw `<https://…>` autolink markdown. */
export function isLikelyRenderedMessageHtml(s: string): boolean {
  const t = s.trimStart();
  if (t.length === 0) return false;
  if (!t.startsWith("<")) return false;
  if (/^<(https?:|mailto:)/i.test(t)) return false;
  return /^<[a-z!?]/i.test(t);
}

export function renderMarkdownFallbackHtml(
  markdown: string,
  options?: Pick<MessageBodyDisplayOptions, "resolveStreamByName">,
): string {
  const markdownRenderer = createMarkdownRenderer(options);
  const rendered = markdownRenderer.parse(markdown, {
    async: false,
    breaks: true,
    gfm: true,
  });
  return typeof rendered === "string" ? rendered : "";
}

function unwrapSingleParagraph(html: string): string {
  const match = /^<p>([\s\S]*)<\/p>\s*$/i.exec(html.trim());
  return match?.[1] ?? html;
}

function buildQuotePlaceholder(index: number): string {
  return `${QUOTE_PLACEHOLDER_START}${index}${QUOTE_PLACEHOLDER_END}`;
}

function restoreQuotePlaceholders(html: string, renderedQuotes: readonly string[]): string {
  let result = html;
  renderedQuotes.forEach((quoteHtml, index) => {
    const placeholder = buildQuotePlaceholder(index);
    result = result
      .replace(new RegExp(`<p>${placeholder}</p>`, "g"), () => quoteHtml)
      .replace(new RegExp(placeholder, "g"), () => quoteHtml);
  });
  return result;
}

export interface MessageBodyDisplayOptions {
  /** Resolves `@**DisplayName**` to a user id for client-side mention spans. Wildcards (`@**all**`, …) do not use this. */
  resolveUserMention?: (displayName: string) => number | null;
  /** Resolves `#**Channel**` syntax to canonical stream metadata for in-app links. */
  resolveStreamByName?: (streamName: string) => ResolvedStreamReference | null;
  /** True when the body definitely came from Zulip markdown mode (`apply_markdown=false`). */
  treatAsMarkdown?: boolean;
  /**
   * Server-rendered HTML paired with `markdown_source`. When present and HTML-like, skips markdown compile.
   */
  renderedContent?: string;
}

/** Markdown → HTML (marked + GFM + highlight). Caller must `sanitizeHtml` before DOM insertion. */
export function messageBodyToUnsanitizedDisplayHtml(
  body: string,
  options?: MessageBodyDisplayOptions,
): string {
  const renderedContent = options?.renderedContent?.trim();
  if (
    options?.treatAsMarkdown &&
    renderedContent != null &&
    renderedContent.length > 0 &&
    isLikelyRenderedMessageHtml(renderedContent)
  ) {
    return renderedContent;
  }
  const t = body.trim();
  if (t.length === 0) return "";
  if (!options?.treatAsMarkdown && isLikelyRenderedMessageHtml(t)) {
    return t;
  }
  let mdInput = t;
  let mentionTokens: ReturnType<typeof injectZulipMentionPlaceholders>["tokens"] | undefined;
  const renderedQuotes: string[] = [];
  if (options?.resolveUserMention != null) {
    const prepared = injectZulipMentionPlaceholders(t, options.resolveUserMention);
    if (prepared.tokens.length > 0) {
      mdInput = prepared.markdown;
      mentionTokens = prepared.tokens;
    }
  }

  const restoreMentions = (fragmentHtml: string): string => {
    if (mentionTokens == null || mentionTokens.length === 0) return fragmentHtml;
    return restoreZulipMentionPlaceholders(fragmentHtml, mentionTokens);
  };

  const renderQuoteHeader = (headerLine: string): string =>
    restoreMentions(
      unwrapSingleParagraph(
        renderMarkdownFallbackHtml(headerLine, {
          resolveStreamByName: options?.resolveStreamByName,
        }),
      ),
    );

  const renderQuoteInner = (inner: string): string => {
    const withNestedQuotes = renderZulipQuoteBlocksInMarkdown(
      inner,
      renderQuoteInner,
      renderQuoteHeader,
      ({ headerLine, bodyHtml }) => {
        const quoteHtml = `<div class="zulip-quote-block">${
          headerLine != null && headerLine.length > 0
            ? `<div class="zulip-quote-header">${renderQuoteHeader(headerLine)}</div>`
            : ""
        }<blockquote class="zulip-quote-body">${bodyHtml}</blockquote></div>`;
        const placeholder = buildQuotePlaceholder(renderedQuotes.length);
        renderedQuotes.push(quoteHtml);
        return placeholder;
      },
    );
    return restoreQuotePlaceholders(
      restoreMentions(
        renderMarkdownFallbackHtml(withNestedQuotes, {
          resolveStreamByName: options?.resolveStreamByName,
        }),
      ),
      renderedQuotes,
    );
  };

  const withQuotes = renderZulipQuoteBlocksInMarkdown(
    mdInput,
    renderQuoteInner,
    renderQuoteHeader,
    ({ headerLine, bodyHtml }) => {
      const quoteHtml = `<div class="zulip-quote-block">${
        headerLine != null && headerLine.length > 0
          ? `<div class="zulip-quote-header">${renderQuoteHeader(headerLine)}</div>`
          : ""
      }<blockquote class="zulip-quote-body">${bodyHtml}</blockquote></div>`;
      const placeholder = buildQuotePlaceholder(renderedQuotes.length);
      renderedQuotes.push(quoteHtml);
      return placeholder;
    },
  );
  const mdHtml = renderMarkdownFallbackHtml(withQuotes, {
    resolveStreamByName: options?.resolveStreamByName,
  });
  return restoreQuotePlaceholders(restoreMentions(mdHtml), renderedQuotes);
}

/** One-line / list previews: strip tags; Markdown is converted via marked first. */
export function plainTextPreviewFromMessageBody(body: string): string {
  const t = body.trim();
  if (t.length === 0) return "";
  if (isLikelyRenderedMessageHtml(t)) {
    return stripHtml(t);
  }
  const html = renderMarkdownFallbackHtml(t);
  return stripHtml(html);
}
