import type { MockMessage } from "~/shared/api/zulip.types";
import {
  findZulipQuoteFenceOpen,
  ZULIP_QUOTE_HEADER_PATTERN,
} from "~/shared/lib/message-zulip-quote.lib";

export type MessageBubbleMetaPlacement = "inline" | "row";

interface ResolveMessageBubbleMetaPlacementOptions {
  message: Pick<MockMessage, "content" | "markdown_source">;
  hasReactions: boolean;
  hasLinkPreviews: boolean;
}

const SIMPLE_TEXT_MARKDOWN_BLOCK_PATTERN =
  /(?:^|\n)\s*(?:#{1,6}\s|[-*+]\s|\d+\.\s|>|```|~~~)|[`*_~[\]]/;
const SIMPLE_TEXT_UNSUPPORTED_HTML_PATTERN =
  /<(?:blockquote|br|code|div|h[1-6]|hr|img|li|ol|p|picture|pre|table|tbody|td|th|thead|tr|ul|video)\b/i;
const ZULIP_MENTION_MARKDOWN_PATTERN = /@(?:_\*\*(?:[^*|]+\|\d+|[^*|]+)\*\*|\*\*[^*]+\*\*)/g;
const MARKDOWN_TEXT_LINK_PATTERN = /(^|[^!])\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const RAW_HTML_LIKE_MARKDOWN_TAG_PATTERN = /<\/?[a-z][^>\r\n]*>/gi;
const FIRST_LINE_PATTERN = /^([^\r\n]*)(\r?\n)?/;

function stripZulipMentionMarkdown(value: string): string {
  return value.replace(ZULIP_MENTION_MARKDOWN_PATTERN, "@mention");
}

function stripInlineMarkdown(value: string): string {
  const withoutMentionsAndLinks = stripZulipMentionMarkdown(value).replace(
    MARKDOWN_TEXT_LINK_PATTERN,
    (_match, prefix: string, label: string) => `${prefix}${label}`,
  );
  return withoutMentionsAndLinks.replace(RAW_HTML_LIKE_MARKDOWN_TAG_PATTERN, "html");
}

function isInlineAllowedHtmlSpan(element: Element): boolean {
  return element.tagName.toLowerCase() === "span" && element.classList.contains("user-mention");
}

function isInlineAllowedHtmlAnchor(element: Element): boolean {
  return element.tagName.toLowerCase() === "a" && element.getAttribute("href") != null;
}

function isInlineAllowedHtmlElement(element: Element): boolean {
  return isInlineAllowedHtmlSpan(element) || isInlineAllowedHtmlAnchor(element);
}

function hasOnlyInlineAllowedHtmlChildren(parent: ParentNode): boolean {
  for (const child of parent.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    const element = child as Element;
    if (!isInlineAllowedHtmlElement(element)) {
      return false;
    }

    if (!hasOnlyInlineAllowedHtmlChildren(element)) {
      return false;
    }
  }

  return true;
}

function getSingleParagraphElement(value: string): HTMLParagraphElement | null {
  if (typeof DOMParser === "undefined") {
    return null;
  }

  const document = new DOMParser().parseFromString(value, "text/html");
  const bodyChildren = Array.from(document.body.childNodes).filter(
    (node) => node.nodeType !== Node.TEXT_NODE || (node.textContent ?? "").trim().length > 0,
  );
  if (bodyChildren.length !== 1) {
    return null;
  }

  const onlyChild = bodyChildren[0];
  if (onlyChild?.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const element = onlyChild as Element;
  return element.tagName.toLowerCase() === "p" ? (element as HTMLParagraphElement) : null;
}

function stripSingleParagraphHtml(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (!/<[^>]+>/i.test(trimmed)) {
    return trimmed;
  }

  const paragraphElement = getSingleParagraphElement(trimmed);
  if (paragraphElement == null) {
    return null;
  }

  if (SIMPLE_TEXT_UNSUPPORTED_HTML_PATTERN.test(paragraphElement.innerHTML)) {
    return null;
  }

  if (!hasOnlyInlineAllowedHtmlChildren(paragraphElement)) {
    return null;
  }

  return (paragraphElement.textContent ?? "").trim();
}

function isSimpleMarkdownText(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length > 0 && !SIMPLE_TEXT_MARKDOWN_BLOCK_PATTERN.test(stripInlineMarkdown(trimmed))
  );
}

function getZulipQuoteMarkdownFenceStart(markdown: string): number {
  const firstLineMatch = FIRST_LINE_PATTERN.exec(markdown);
  const firstLine = firstLineMatch?.[1]?.trim() ?? "";
  if (!ZULIP_QUOTE_HEADER_PATTERN.test(firstLine)) {
    return 0;
  }

  return firstLineMatch?.[0]?.length ?? 0;
}

function isSimpleReplyAfterZulipQuoteMarkdown(value: string): boolean {
  const trimmed = value.trim();
  const fenceStart = getZulipQuoteMarkdownFenceStart(trimmed);
  const quoteFence = findZulipQuoteFenceOpen(trimmed, fenceStart);
  if (quoteFence?.startIndex !== fenceStart) {
    return false;
  }

  return isSimpleMarkdownText(trimmed.slice(quoteFence.endIndex));
}

function getNonEmptyBodyChildren(value: string): ChildNode[] {
  if (typeof DOMParser === "undefined") {
    return [];
  }

  const document = new DOMParser().parseFromString(value, "text/html");
  return Array.from(document.body.childNodes).filter(
    (node) => node.nodeType !== Node.TEXT_NODE || (node.textContent ?? "").trim().length > 0,
  );
}

function isSimpleRenderedReplyParagraph(element: Element | undefined): boolean {
  if (element?.tagName.toLowerCase() !== "p") {
    return false;
  }

  if (SIMPLE_TEXT_UNSUPPORTED_HTML_PATTERN.test(element.innerHTML)) {
    return false;
  }

  return hasOnlyInlineAllowedHtmlChildren(element) && (element.textContent ?? "").trim().length > 0;
}

function isZulipQuoteBlockElement(element: Element | undefined): boolean {
  return (
    element?.tagName.toLowerCase() === "div" && element.classList.contains("zulip-quote-block")
  );
}

function isSimpleReplyAfterRenderedQuoteHtml(value: string): boolean {
  const children = getNonEmptyBodyChildren(value);
  if (children.some((child) => child.nodeType !== Node.ELEMENT_NODE)) {
    return false;
  }

  const elements = children as Element[];
  if (elements.length === 2) {
    return isZulipQuoteBlockElement(elements[0]) && isSimpleRenderedReplyParagraph(elements[1]);
  }

  if (elements.length === 3) {
    const header = elements[0];
    const quote = elements[1];
    const reply = elements[2];
    return (
      header?.tagName.toLowerCase() === "p" &&
      quote?.tagName.toLowerCase() === "blockquote" &&
      isSimpleRenderedReplyParagraph(reply)
    );
  }

  return false;
}

function isSimpleTextMessage(message: Pick<MockMessage, "content" | "markdown_source">): boolean {
  const source = (message.markdown_source ?? message.content).trim();
  if (source.length === 0) {
    return false;
  }

  if (message.markdown_source != null) {
    return isSimpleMarkdownText(source) || isSimpleReplyAfterZulipQuoteMarkdown(source);
  }

  if (isSimpleReplyAfterRenderedQuoteHtml(source)) {
    return true;
  }

  const paragraphText = stripSingleParagraphHtml(source);
  return paragraphText != null && paragraphText.length > 0;
}

export function resolveMessageBubbleMetaPlacement({
  message,
  hasReactions,
  hasLinkPreviews,
}: ResolveMessageBubbleMetaPlacementOptions): MessageBubbleMetaPlacement {
  if (hasReactions || hasLinkPreviews) {
    return "row";
  }

  return isSimpleTextMessage(message) ? "inline" : "row";
}
