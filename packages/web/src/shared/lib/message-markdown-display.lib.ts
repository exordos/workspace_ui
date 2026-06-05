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
import hljs from "highlight.js/lib/common";
import { Marked, type Token, type TokenizerAndRendererExtension, type Tokens } from "marked";
import { stripHtml } from "~/shared/lib/html";
import { renderEmojiShortcodesInHtml } from "~/shared/lib/message-emoji-shortcodes.lib";
import {
  collectMessageInlineImageIdentities,
  normalizeUserUploadImageIdentity,
  shouldSkipInliningUserUploadImageLink,
} from "~/shared/lib/message-inline-user-upload-image.lib";
import { createInlineUserUploadVideoElement } from "~/shared/lib/message-inline-user-upload-video.lib";
import {
  injectZulipMentionPlaceholders,
  restoreZulipMentionPlaceholders,
} from "~/shared/lib/message-zulip-mentions.lib";
import { renderZulipQuoteBlocksInMarkdown } from "~/shared/lib/message-zulip-quote.lib";
import { prepareProtectedUserUploadImageElement } from "~/shared/lib/protected-message-media";
import { isUserUploadImagePath } from "~/shared/lib/protected-message-media-thumbnail";
import { isUserUploadVideoPath } from "~/shared/lib/user-upload-media-path.lib";

const LANGUAGE_CLASS_PATTERN = /\b(?:language|lang)-([a-z0-9#+-]+)\b/i;

const LANGUAGE_ALIASES: Record<string, string> = {
  cjs: "javascript",
  jsx: "javascript",
  py: "python",
  sh: "bash",
  ts: "typescript",
  tsx: "typescript",
};

function resolveLanguageFromClassName(className: string): string | null {
  const match = LANGUAGE_CLASS_PATTERN.exec(className);
  if (match == null) {
    return null;
  }
  const rawLanguage = match[1]?.toLowerCase();
  if (rawLanguage == null || rawLanguage.length === 0) {
    return null;
  }
  const normalizedLanguage = LANGUAGE_ALIASES[rawLanguage] ?? rawLanguage;
  return hljs.getLanguage(normalizedLanguage) ? normalizedLanguage : null;
}

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

const markdownRenderer = new Marked({
  extensions: [ZULIP_BLOCK_SPOILER_EXTENSION, INLINE_SPOILER_EXTENSION],
});

/** True when the string looks like HTML from Zulip, not raw `<https://…>` autolink markdown. */
export function isLikelyRenderedMessageHtml(s: string): boolean {
  const t = s.trimStart();
  if (t.length === 0) return false;
  if (!t.startsWith("<")) return false;
  if (/^<(https?:|mailto:)/i.test(t)) return false;
  return /^<[a-z!?]/i.test(t);
}

export function renderMarkdownFallbackHtml(markdown: string): string {
  const rendered = markdownRenderer.parse(markdown, {
    async: false,
    breaks: true,
    gfm: true,
  });
  return typeof rendered === "string" ? rendered : "";
}

export function applySyntaxHighlighting(html: string): string {
  if (typeof document === "undefined" || html.trim().length === 0) {
    return html;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  const codeBlocks = wrapper.querySelectorAll("pre code");
  for (const codeBlock of codeBlocks) {
    const sourceCode = codeBlock.textContent ?? "";
    if (sourceCode.trim().length === 0) {
      continue;
    }

    try {
      const language = resolveLanguageFromClassName(codeBlock.className);
      const highlighted = language
        ? hljs.highlight(sourceCode, { ignoreIllegals: true, language }).value
        : hljs.highlightAuto(sourceCode).value;

      codeBlock.innerHTML = highlighted;
      codeBlock.classList.add("hljs");
      if (language != null) {
        codeBlock.classList.add(`language-${language}`);
      }
    } catch {
      continue;
    }
  }

  return wrapper.innerHTML;
}

function inlineUserUploadImageLinks(html: string): string {
  // Show inline images for `/user_uploads/` image links while keeping markdown as source of truth.
  if (typeof document === "undefined" || !html.includes("/user_uploads/")) {
    return html;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const inlineIdentities = collectMessageInlineImageIdentities(html);

  const links = wrapper.querySelectorAll<HTMLAnchorElement>("a[href]");
  for (const link of links) {
    const href = link.getAttribute("href")?.trim();
    if (href == null || href.length === 0) continue;
    if (!isUserUploadImagePath(href)) continue;
    if (link.querySelector("img") != null) continue;
    const inQuoteBody = link.closest(".zulip-quote-body") != null;
    if (!inQuoteBody && shouldSkipInliningUserUploadImageLink(href, inlineIdentities)) continue;

    const title = (link.textContent ?? "").trim();
    const fallbackLabel = title.length > 0 ? title : "image";
    const image = document.createElement("img");
    // Set data-auth-src immediately so the browser does not fetch `/user_uploads/...` before auth-loader.
    prepareProtectedUserUploadImageElement(image, href);

    image.setAttribute("alt", fallbackLabel);
    image.setAttribute("title", fallbackLabel);
    link.replaceChildren(image);
  }

  removeDuplicateQuoteBlockInlineImages(wrapper);

  return wrapper.innerHTML;
}

function collectInlineImageIdentityFromElement(element: Element): string | null {
  if (element instanceof HTMLAnchorElement) {
    return normalizeUserUploadImageIdentity(element.getAttribute("href") ?? "");
  }
  if (element instanceof HTMLImageElement) {
    const authSrc = element.getAttribute("data-auth-src");
    if (authSrc != null && authSrc.length > 0) {
      return normalizeUserUploadImageIdentity(authSrc);
    }
    return normalizeUserUploadImageIdentity(element.getAttribute("src") ?? "");
  }
  return null;
}

function resolveMessageInlineImageBlockIdentity(block: Element): string | null {
  for (const anchor of block.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const identity = collectInlineImageIdentityFromElement(anchor);
    if (identity != null) {
      return identity;
    }
  }
  for (const image of block.querySelectorAll<HTMLImageElement>("img[src], img[data-auth-src]")) {
    const identity = collectInlineImageIdentityFromElement(image);
    if (identity != null) {
      return identity;
    }
  }
  return null;
}

/** Removes Zulip `.message_inline_image` duplicates after the same file was inlined in `.zulip-quote-body`. */
function removeDuplicateQuoteBlockInlineImages(wrapper: ParentNode): void {
  for (const quoteBlock of wrapper.querySelectorAll<HTMLElement>(".zulip-quote-block")) {
    const quoteBody = quoteBlock.querySelector(".zulip-quote-body");
    if (quoteBody == null) continue;

    const inlinedIdentities = new Set<string>();
    for (const image of quoteBody.querySelectorAll<HTMLImageElement>(
      "img[data-auth-src], img.message-media-preview",
    )) {
      const identity = collectInlineImageIdentityFromElement(image);
      if (identity != null) {
        inlinedIdentities.add(identity);
      }
    }
    if (inlinedIdentities.size === 0) continue;

    for (const inlineBlock of quoteBlock.querySelectorAll(".message_inline_image")) {
      const blockIdentity = resolveMessageInlineImageBlockIdentity(inlineBlock);
      if (blockIdentity != null && inlinedIdentities.has(blockIdentity)) {
        inlineBlock.remove();
      }
    }
  }
}

function inlineUserUploadVideoLinks(html: string): string {
  if (typeof document === "undefined" || !html.includes("/user_uploads/")) {
    return html;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  const links = wrapper.querySelectorAll<HTMLAnchorElement>("a[href]");
  for (const link of links) {
    const href = link.getAttribute("href")?.trim();
    if (href == null || href.length === 0) continue;
    if (!isUserUploadVideoPath(href)) continue;
    if (link.querySelector("video") != null) continue;

    link.replaceWith(createInlineUserUploadVideoElement(href));
  }

  return wrapper.innerHTML;
}

function inlineUserUploadMediaLinks(html: string): string {
  return inlineUserUploadVideoLinks(inlineUserUploadImageLinks(html));
}

function normalizeZulipSpoilerBlocks(html: string): string {
  if (typeof document === "undefined" || !html.includes("spoiler-block")) {
    return html;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  const spoilerBlocks = wrapper.querySelectorAll<HTMLElement>(".spoiler-block");
  for (const block of spoilerBlocks) {
    const header = block.querySelector<HTMLElement>(".spoiler-header");
    const content = block.querySelector<HTMLElement>(".spoiler-content");
    if (content == null) continue;

    if (header == null) {
      const fallbackHeader = document.createElement("div");
      fallbackHeader.classList.add("spoiler-header");
      fallbackHeader.textContent = DEFAULT_ZULIP_SPOILER_HEADER;
      block.insertBefore(fallbackHeader, content);
      continue;
    }

    if ((header.textContent ?? "").trim().length === 0) {
      header.textContent = DEFAULT_ZULIP_SPOILER_HEADER;
    }
  }

  return wrapper.innerHTML;
}

function unwrapSingleParagraph(html: string): string {
  const match = /^<p>([\s\S]*)<\/p>\s*$/i.exec(html.trim());
  return match?.[1] ?? html;
}

/** Wraps server-rendered blockquotes that follow a Zulip reply header in `.zulip-quote-block`. */
function normalizeZulipQuoteBlocksInHtml(html: string): string {
  if (typeof document === "undefined" || !html.includes("blockquote")) {
    return html;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  const blockquotes = wrapper.querySelectorAll<HTMLElement>("blockquote");
  for (const blockquote of blockquotes) {
    if (blockquote.classList.contains("zulip-quote-body")) continue;
    if (blockquote.closest(".zulip-quote-block") != null) continue;

    const previous = blockquote.previousElementSibling;
    if (previous == null) continue;

    const hasMention = previous.querySelector(".user-mention") != null;
    const wroteLink = previous.querySelector("a[href]");
    if (!hasMention && wroteLink == null) continue;

    const quoteBlock = document.createElement("div");
    quoteBlock.className = "zulip-quote-block";

    const header = document.createElement("div");
    header.className = "zulip-quote-header";
    header.innerHTML = previous.innerHTML;

    blockquote.classList.add("zulip-quote-body");
    previous.replaceWith(quoteBlock);
    quoteBlock.appendChild(header);
    quoteBlock.appendChild(blockquote);

    let next = quoteBlock.nextElementSibling;
    while (next instanceof HTMLElement && next.classList.contains("message_inline_image")) {
      const toMove = next;
      next = next.nextElementSibling;
      quoteBlock.appendChild(toMove);
    }
  }

  return wrapper.innerHTML;
}

function normalizeRenderedMessageHtml(html: string): string {
  return normalizeZulipQuoteBlocksInHtml(normalizeZulipSpoilerBlocks(html));
}

export interface MessageBodyDisplayOptions {
  /** Resolves `@**DisplayName**` to a user id for client-side mention spans. Wildcards (`@**all**`, …) do not use this. */
  resolveUserMention?: (displayName: string) => number | null;
  /** Resolves custom realm emoji shortcode (`:name:`) to image URL. */
  resolveCustomEmojiShortcodeImageUrl?: (shortcode: string) => string | undefined;
}

/** Markdown → HTML (marked + GFM + highlight). Caller must `sanitizeHtml` before DOM insertion. */
export function messageBodyToUnsanitizedDisplayHtml(
  body: string,
  options?: MessageBodyDisplayOptions,
): string {
  const t = body.trim();
  if (t.length === 0) return "";
  if (isLikelyRenderedMessageHtml(t)) {
    return inlineUserUploadMediaLinks(normalizeRenderedMessageHtml(t));
  }
  let mdInput = t;
  let mentionTokens: ReturnType<typeof injectZulipMentionPlaceholders>["tokens"] | undefined;
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
    restoreMentions(unwrapSingleParagraph(renderMarkdownFallbackHtml(headerLine)));

  const renderQuoteInner = (inner: string): string => {
    const withNestedQuotes = renderZulipQuoteBlocksInMarkdown(
      inner,
      renderQuoteInner,
      renderQuoteHeader,
    );
    return restoreMentions(renderMarkdownFallbackHtml(withNestedQuotes));
  };

  const withQuotes = renderZulipQuoteBlocksInMarkdown(mdInput, renderQuoteInner, renderQuoteHeader);
  const mdHtml = renderMarkdownFallbackHtml(withQuotes);
  let html = applySyntaxHighlighting(mdHtml);
  html = restoreMentions(html);
  html = renderEmojiShortcodesInHtml(html, {
    resolveCustomEmojiShortcodeImageUrl: options?.resolveCustomEmojiShortcodeImageUrl,
  });
  const withInlineUploads = inlineUserUploadMediaLinks(html);
  return normalizeRenderedMessageHtml(withInlineUploads);
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
