/**
 * Extracts external URLs from message markdown suitable for Zulip link-preview unfurl.
 *
 * Used with POST /messages/render — does not fetch OG data in the browser.
 *
 * Usage:
 *   import {
 *     extractFirstLinkPreviewUrl,
 *     extractLinkPreviewUrls,
 *   } from "~/shared/lib/message-link-preview-urls.lib";
 */
import { getJitsiMeetingUrl } from "~/shared/lib/jitsi";
import { MAX_LINK_PREVIEWS_PER_MESSAGE } from "~/shared/lib/message-link-preview-url-match.lib";
import { ZULIP_QUOTE_FENCE_STRIP_PATTERN } from "~/shared/lib/message-zulip-quote.lib";
import { isValidUrl } from "~/shared/lib/validation";

const ANGLE_BRACKET_URL_PATTERN = /<(https?:\/\/[^>\s]+)>/gi;
const MARKDOWN_LINK_LABEL_PATTERN = /\[[^\]]*\]\(/gi;
const PLAIN_URL_PATTERN = /https?:\/\/[^\s<>"\]]+/gi;

const IMAGE_FILE_EXTENSION_PATTERN = /\.(avif|gif|jpe?g|png|svg|webp)(\?|#|$)/i;

const ZULIP_PERMALINK_PATH_PATTERN = /#narrow\b|#compose\b/i;

const TRAILING_SENTENCE_PUNCTUATION_PATTERN = /[,.!?;:]+$/u;

function countChar(value: string, char: string): number {
  let count = 0;
  for (const ch of value) {
    if (ch === char) count += 1;
  }
  return count;
}

/** Drops closing brackets/parens that belong to surrounding prose, not the URL path. */
function stripUnbalancedTrailingClosers(url: string): string {
  let result = url;
  let changed = true;
  while (changed) {
    changed = false;
    const before = result;
    while (result.endsWith(")")) {
      const openCount = countChar(result, "(");
      const closeCount = countChar(result, ")");
      if (closeCount <= openCount) break;
      result = result.slice(0, -1);
      changed = true;
    }
    while (result.endsWith("]")) {
      const openCount = countChar(result, "[");
      const closeCount = countChar(result, "]");
      if (closeCount <= openCount) break;
      result = result.slice(0, -1);
      changed = true;
    }
    const withoutSentencePunctuation = result.replace(TRAILING_SENTENCE_PUNCTUATION_PATTERN, "");
    if (withoutSentencePunctuation !== result) {
      result = withoutSentencePunctuation;
      changed = true;
    }
    if (result === before && !changed) break;
  }
  return result;
}

function normalizeCandidateUrl(raw: string): string | null {
  const trimmed = stripUnbalancedTrailingClosers(raw.trim());
  if (trimmed.length === 0) return null;
  if (!isValidUrl(trimmed)) return null;
  return trimmed;
}

/** Reads a markdown link destination `(https://…)` with balanced `()` inside the URL. */
function readMarkdownLinkDestinationUrl(markdown: string, openParenIndex: number): string | null {
  const start = openParenIndex + 1;
  if (!markdown.slice(start).startsWith("http")) return null;

  let depth = 0;
  let index = start;
  while (index < markdown.length) {
    const ch = markdown[index]!;
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      if (depth === 0) break;
      depth -= 1;
    } else if (/\s/u.test(ch) && depth === 0) {
      break;
    }
    index += 1;
  }

  return normalizeCandidateUrl(markdown.slice(start, index));
}

function isExcludedPreviewUrl(
  url: string,
  _markdownBody: string,
  jitsiUrlInBody: string | null,
): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return true;
    }
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (path.includes("/user_uploads/")) {
      return true;
    }
    if (path.includes("/api/v1/")) {
      return true;
    }
    if (ZULIP_PERMALINK_PATH_PATTERN.test(parsed.hash)) {
      return true;
    }
    if (IMAGE_FILE_EXTENSION_PATTERN.test(path)) {
      return true;
    }
  } catch {
    return true;
  }

  if (getJitsiMeetingUrl(url) != null || jitsiUrlInBody === url) {
    return true;
  }

  return false;
}

function collectUrlsFromMarkdown(markdown: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const add = (raw: string | null) => {
    if (raw == null) return;
    const normalized = normalizeCandidateUrl(raw);
    if (normalized == null || seen.has(normalized)) return;
    seen.add(normalized);
    found.push(normalized);
  };

  for (const match of markdown.matchAll(ANGLE_BRACKET_URL_PATTERN)) {
    const url = match[1];
    if (url != null) add(url);
  }
  for (const match of markdown.matchAll(MARKDOWN_LINK_LABEL_PATTERN)) {
    const openParenIndex = match.index != null ? match.index + match[0].length - 1 : -1;
    if (openParenIndex >= 0) {
      add(readMarkdownLinkDestinationUrl(markdown, openParenIndex));
    }
  }
  for (const match of markdown.matchAll(PLAIN_URL_PATTERN)) {
    const url = match[0];
    if (url != null) add(url);
  }

  return found;
}

/** Removes Zulip quote fences so URLs inside cited text are not previewed. */
export function stripQuotedMarkdownRegions(markdown: string): string {
  return markdown.replace(ZULIP_QUOTE_FENCE_STRIP_PATTERN, "");
}

/** Returns previewable URLs in markdown (outside quote fences), in discovery order. */
export function extractLinkPreviewUrls(markdown: string): string[] {
  const body = stripQuotedMarkdownRegions(markdown).trim();
  if (body.length === 0) return [];

  const jitsiUrlInBody = getJitsiMeetingUrl(body);
  const result: string[] = [];
  for (const url of collectUrlsFromMarkdown(body)) {
    if (!isExcludedPreviewUrl(url, body, jitsiUrlInBody)) {
      result.push(url);
    }
    if (result.length >= MAX_LINK_PREVIEWS_PER_MESSAGE) {
      break;
    }
  }
  return result;
}

/** Returns the first URL in markdown that should receive a link preview card, or null. */
export function extractFirstLinkPreviewUrl(markdown: string): string | null {
  return extractLinkPreviewUrls(markdown)[0] ?? null;
}
