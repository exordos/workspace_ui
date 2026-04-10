/**
 * HTML sanitization for Zulip message content.
 *
 * Uses DOMPurify with a strict allowlist of tags/attributes.
 * Rewrites relative `<img src>` to absolute URLs using the realm base URL.
 *
 * Usage:
 *   import { sanitizeHtml, stripHtml } from "~/lib/html";
 *
 *   const safe = sanitizeHtml(message.content, getRealmBaseUrl());
 *   const plain = stripHtml(message.content);
 */
import DOMPurify from "dompurify";

/** Strips all HTML tags from a string (e.g. for clipboard copy of message text). */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

const MESSAGE_ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "span",
  "div",
  "img",
  "video",
  "source",
  "details",
  "summary",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

const MESSAGE_ADD_ATTR = [
  "src",
  "alt",
  "class",
  "controls",
  "preload",
  "poster",
  "type",
  "colspan",
  "rowspan",
  /** Zulip user/group mention markup (`span.user-mention`, `span.user-group-mention`). */
  "data-user-id",
  "data-user-group-id",
];

/** Resolves a relative message media URL (`img` / `video` / `poster`) to absolute using the realm or uploads base. */
export function resolveMessageMediaUrl(src: string, baseUrl: string): string {
  const trimmedBase = baseUrl.trim();
  if (trimmedBase === "") return src;
  const base = trimmedBase.replace(/\/+$/, "");
  const s = src.trim();
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:")) {
    return s;
  }
  return s.startsWith("/") ? `${base}${s}` : `${base}/${s}`;
}

/** Rewrites relative media `src` / `poster` URLs to absolute using the Zulip realm base URL. */
function rewriteRelativeMediaSrc(html: string, baseUrl: string): string {
  if (!baseUrl?.trim()) return html;

  const rewriteAttr = (_match: string, _quote: string, src: string) => {
    const absolute = resolveMessageMediaUrl(src, baseUrl);
    return _match.replace(src, absolute);
  };

  let result = html.replace(/<(?:img|video|source)\s[^>]*?src=(["'])([^"']+)\1/gi, rewriteAttr);
  result = result.replace(/<video\s[^>]*?poster=(["'])([^"']+)\1/gi, rewriteAttr);
  return result;
}

/** Sanitizes Zulip message HTML for safe rendering. Strips unsafe tags, rewrites relative image URLs. */
export function sanitizeHtml(html: string, baseUrl?: string): string {
  const toSanitize = baseUrl ? rewriteRelativeMediaSrc(html, baseUrl) : html;
  return DOMPurify.sanitize(toSanitize, {
    ALLOWED_TAGS: MESSAGE_ALLOWED_TAGS,
    ADD_ATTR: MESSAGE_ADD_ATTR,
  });
}
