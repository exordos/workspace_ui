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
import { isValidUrl } from "~/shared/lib/validation";

const ANGLE_BRACKET_URL_PATTERN = /<(https?:\/\/[^>\s]+)>/gi;
const MARKDOWN_LINK_URL_PATTERN = /\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi;
const PLAIN_URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;

const IMAGE_FILE_EXTENSION_PATTERN = /\.(avif|gif|jpe?g|png|svg|webp)(\?|#|$)/i;

const ZULIP_PERMALINK_PATH_PATTERN = /#narrow\b|#compose\b/i;

/** Zulip reply/forward fenced quote blocks (` ```quote ` … ` ``` `). */
const ZULIP_QUOTE_FENCE_PATTERN = /```quote\s*\r?\n[\s\S]*?\r?\n```/gi;

/** Removes Zulip quote fences so URLs inside cited text are not previewed. */
export function stripQuotedMarkdownRegions(markdown: string): string {
  return markdown.replace(ZULIP_QUOTE_FENCE_PATTERN, "");
}

function normalizeCandidateUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/[),.!?;:]+$/u, "");
  if (trimmed.length === 0) return null;
  if (!isValidUrl(trimmed)) return null;
  return trimmed;
}

function isExcludedPreviewUrl(
  url: string,
  markdownBody: string,
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

  const add = (raw: string) => {
    const normalized = normalizeCandidateUrl(raw);
    if (normalized == null || seen.has(normalized)) return;
    seen.add(normalized);
    found.push(normalized);
  };

  for (const match of markdown.matchAll(ANGLE_BRACKET_URL_PATTERN)) {
    const url = match[1];
    if (url != null) add(url);
  }
  for (const match of markdown.matchAll(MARKDOWN_LINK_URL_PATTERN)) {
    const url = match[1];
    if (url != null) add(url);
  }
  for (const match of markdown.matchAll(PLAIN_URL_PATTERN)) {
    const url = match[0];
    if (url != null) add(url);
  }

  return found;
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
