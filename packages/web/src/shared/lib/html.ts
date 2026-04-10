/**
 * HTML sanitization for Zulip message content.
 *
 * Uses DOMPurify with a strict allowlist of tags/attributes.
 * Rewrites relative `<img src>` to absolute URLs using the realm base URL.
 * External and in-app links open in a new browsing context (`target="_blank"`, `rel="noopener noreferrer"`).
 *
 * Usage:
 *   import { sanitizeHtml, stripHtml } from "~/lib/html";
 *
 *   const safe = sanitizeHtml(message.content, getRealmBaseUrl());
 *   // If `baseUrl` is omitted but HTML contains `/user_uploads/`, realm base is inferred (Electron `file://` safe).
 *   const plain = stripHtml(message.content);
 */
import DOMPurify from "dompurify";

import { getMessageImagesBaseUrl } from "~/shared/lib/zulip-message-media-base.lib";
import { rewriteUserUploadMediaUrlToCanonical } from "~/shared/lib/user-uploads-url.lib";

/** When baseUrl is omitted (e.g. Electron `file://` shell), resolve `/user_uploads/` via realm so `src` is not `file:///user_uploads/...`. */
function resolveSanitizeMediaBaseUrl(html: string, baseUrl?: string): string | undefined {
  const trimmed = baseUrl?.trim();
  if (trimmed != null && trimmed.length > 0) {
    return trimmed;
  }
  if (html.includes("/user_uploads/")) {
    return getMessageImagesBaseUrl();
  }
  return undefined;
}

let messageSanitizeHooksInstalled = false;

function ensureMessageLinkTargetHooks(): void {
  if (messageSanitizeHooksInstalled) return;
  messageSanitizeHooksInstalled = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName !== "A" || !node.hasAttribute("href")) return;
    const href = node.getAttribute("href")?.trim() ?? "";
    if (href === "") return;
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  });
}

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
  "width",
  "height",
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

/** Rewrites absolute `/user_uploads/` links that point at the wrong host to the canonical uploads base. */
function rewriteCanonicalUserUploadMediaAttrs(html: string, canonicalUploadsBase: string): string {
  if (!canonicalUploadsBase?.trim()) return html;
  const rewrite = (url: string) => rewriteUserUploadMediaUrlToCanonical(url, canonicalUploadsBase);

  let result = html.replace(/<(?:img|video|source)\s[^>]*?src=(["'])([^"']+)\1/gi, (match, _q, src) =>
    match.replace(src, rewrite(src)),
  );
  result = result.replace(/<video\s[^>]*?poster=(["'])([^"']+)\1/gi, (match, _q, poster) =>
    match.replace(poster, rewrite(poster)),
  );
  result = result.replace(/<a\s[^>]*?href=(["'])([^"']+)\1/gi, (match, _q, href) => {
    if (!href.includes("/user_uploads/")) return match;
    return match.replace(href, rewrite(href));
  });
  return result;
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
  ensureMessageLinkTargetHooks();
  const effectiveBase = resolveSanitizeMediaBaseUrl(html, baseUrl);
  const withCanonicalUploads = effectiveBase
    ? rewriteCanonicalUserUploadMediaAttrs(html, effectiveBase)
    : html;
  const toSanitize = effectiveBase
    ? rewriteRelativeMediaSrc(withCanonicalUploads, effectiveBase)
    : withCanonicalUploads;
  return DOMPurify.sanitize(toSanitize, {
    ALLOWED_TAGS: MESSAGE_ALLOWED_TAGS,
    ADD_ATTR: MESSAGE_ADD_ATTR,
  });
}
