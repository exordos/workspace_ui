/**
 * Zulip fenced quote blocks (` ```quote ` … ` ``` `) for message display and compose.
 *
 * Supports variable-length fences (CommonMark) for nested quotes and code inside quotes.
 * Display: preprocess markdown into `.zulip-quote-block` HTML before `marked`.
 * Compose: `wrapWithZulipQuoteFence` picks an unused fence length.
 *
 * Usage:
 *   import {
 *     buildZulipQuoteBlock,
 *     renderZulipQuoteBlocksInMarkdown,
 *     wrapWithZulipQuoteFence,
 *   } from "~/shared/lib/message-zulip-quote.lib";
 */

/** Matches `@_**Name|id** [wrote](url):` or `@_**Name|id**:` reply quote headers. */
export const ZULIP_QUOTE_HEADER_PATTERN =
  /^@_\*\*(?:[^*|]+)\|\d+\*\*(?:\s+\[[^\]]+\]\([^)]+\))?:\s*$/;

const PLACEHOLDER_START = "\uE000";
const PLACEHOLDER_END = "\uE001";

/** Matches quote headers after Zulip mention placeholders are injected. */
const ZULIP_QUOTE_HEADER_PLACEHOLDER_PATTERN = new RegExp(
  `^${PLACEHOLDER_START}\\d+${PLACEHOLDER_END}(?:\\s+\\[[^\\]]+\\]\\([^)]+\\))?:\\s*$`,
);

function isQuoteHeaderLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    ZULIP_QUOTE_HEADER_PATTERN.test(trimmed) || ZULIP_QUOTE_HEADER_PLACEHOLDER_PATTERN.test(trimmed)
  );
}

export interface ZulipQuoteFenceMatch {
  backtickCount: number;
  innerContent: string;
  raw: string;
  startIndex: number;
  endIndex: number;
}

export interface ZulipQuoteFenceWrapper {
  backtickCount: number;
  open: string;
  close: string;
  wrap: (content: string) => string;
}

const FENCE_LINE_START_PATTERN = /^(`{3,})quote[ \t]*\r?\n/;
const FENCE_OPEN_SEARCH_PATTERN = /`{3,}quote[ \t]*\r?\n/;

function maxFenceBacktickCountInContent(content: string): number {
  let max = 0;
  for (const line of content.split(/\r?\n/)) {
    const match = /^(`{3,})(?:quote|[a-z0-9#+-]*)\s*$/.exec(line.trim());
    if (match != null) {
      const count = match[1]?.length ?? 0;
      if (count > max) max = count;
    }
  }
  return max;
}

/** Finds the first Zulip quote fence opening at `src` start (or from index 0). */
export function findZulipQuoteFenceOpen(src: string, fromIndex = 0): ZulipQuoteFenceMatch | null {
  const slice = src.slice(fromIndex);
  const openMatch = FENCE_LINE_START_PATTERN.exec(slice);
  if (openMatch == null) return null;

  const backtickCount = openMatch[1]?.length ?? 0;
  const openFence = "`".repeat(backtickCount);
  const contentStart = openMatch[0].length;
  const closePattern = new RegExp(`\\r?\\n${openFence}(?:\\r?\\n|$)`);
  const closeMatch = closePattern.exec(slice.slice(contentStart));
  if (closeMatch == null) return null;

  const innerContent = slice.slice(contentStart, contentStart + closeMatch.index);
  const raw = slice.slice(0, contentStart + closeMatch.index + closeMatch[0].length);

  return {
    backtickCount,
    innerContent,
    raw,
    startIndex: fromIndex,
    endIndex: fromIndex + raw.length,
  };
}

/** Picks fence length (max existing backticks in content + 1, minimum 3) for compose/forward. */
export function wrapWithZulipQuoteFence(content: string): ZulipQuoteFenceWrapper {
  const existingMax = maxFenceBacktickCountInContent(content);
  const backtickCount = Math.max(3, existingMax + 1);
  const fence = "`".repeat(backtickCount);
  const open = `${fence}quote`;
  const close = fence;
  return {
    backtickCount,
    open,
    close,
    wrap: (inner: string) => `${open}\n${inner}\n${close}`,
  };
}

/** Zulip quote block for compose/forward: header line, fenced content, trailing blank line. */
export function buildZulipQuoteBlock(headerLine: string, content: string): string {
  const quoteFence = wrapWithZulipQuoteFence(content);
  return `${headerLine}\n${quoteFence.wrap(content)}\n\n`;
}

function buildQuoteBlockHtml(
  headerLine: string | null,
  bodyHtml: string,
  renderHeader?: (headerMarkdown: string) => string,
): string {
  const headerHtml =
    headerLine != null && headerLine.length > 0
      ? `<div class="zulip-quote-header">${renderHeader?.(headerLine) ?? headerLine.trim()}</div>`
      : "";
  return `<div class="zulip-quote-block">${headerHtml}<blockquote class="zulip-quote-body">${bodyHtml}</blockquote></div>`;
}

function findQuoteHeaderBefore(markdown: string, fenceStartIndex: number): string | null {
  const before = markdown.slice(0, fenceStartIndex);
  const lines = before.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]?.trim() ?? "";
    if (line.length === 0) continue;
    if (isQuoteHeaderLine(line)) {
      return line;
    }
    return null;
  }
  return null;
}

function headerSliceRange(
  markdown: string,
  fenceStartIndex: number,
  headerLine: string,
): { start: number; end: number } | null {
  const headerIndex = markdown.lastIndexOf(headerLine, fenceStartIndex);
  if (headerIndex < 0) return null;
  let start = headerIndex;
  if (start > 0 && markdown[start - 1] === "\n") start -= 1;
  if (start > 0 && markdown[start - 1] === "\r") start -= 1;
  let end = headerIndex + headerLine.length;
  while (end < fenceStartIndex && (markdown[end] === "\r" || markdown[end] === "\n")) {
    end += 1;
  }
  return { start, end };
}

/**
 * Replaces Zulip quote fences with HTML blocks. `renderInner` should render markdown inside a quote
 * (typically recursively calling this function then `marked`).
 */
export function renderZulipQuoteBlocksInMarkdown(
  markdown: string,
  renderInner: (innerMarkdown: string) => string,
  renderHeader?: (headerMarkdown: string) => string,
  renderBlock?: (options: { headerLine: string | null; bodyHtml: string }) => string,
): string {
  let result = "";
  let cursor = 0;

  while (cursor < markdown.length) {
    const remaining = markdown.slice(cursor);
    const fenceIndex = remaining.search(FENCE_OPEN_SEARCH_PATTERN);
    if (fenceIndex < 0) {
      result += remaining;
      break;
    }

    const absoluteFenceStart = cursor + fenceIndex;
    const match = findZulipQuoteFenceOpen(markdown, absoluteFenceStart);
    if (match == null) {
      result += markdown[cursor];
      cursor += 1;
      continue;
    }

    const headerLine = findQuoteHeaderBefore(markdown, match.startIndex);
    let segmentEnd = absoluteFenceStart;
    if (headerLine != null) {
      const headerRange = headerSliceRange(markdown, match.startIndex, headerLine);
      if (headerRange != null) {
        segmentEnd = headerRange.start;
      }
    }

    result += markdown.slice(cursor, segmentEnd);
    const innerHtml = renderInner(match.innerContent);
    const quoteBlockHtml = buildQuoteBlockHtml(headerLine, innerHtml, renderHeader);
    result += renderBlock?.({ headerLine, bodyHtml: innerHtml }) ?? quoteBlockHtml;
    cursor = match.endIndex;
  }

  return result;
}

/** Variable-length Zulip quote fence pattern for stripping quoted regions from link previews. */
export const ZULIP_QUOTE_FENCE_STRIP_PATTERN = /`{3,}quote\s*\r?\n[\s\S]*?\r?\n`{3,}/gi;
