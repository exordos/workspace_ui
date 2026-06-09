/**
 * Sanitizes Zulip message HTML (DOMPurify allowlist, realm media URL rewrite, safe link targets).
 *
 * Usage:
 *   import { sanitizeHtml, stripHtml } from "~/shared/lib/html";
 *   const safe = sanitizeHtml(message.content, getRealmBaseUrl());
 *
 * When `baseUrl` is omitted but HTML contains `/user_uploads/`, realm base is inferred (Electron `file://`).
 */
import DOMPurify from "dompurify";
import { env } from "~/shared/lib/env";
import {
  isExternalContentPath,
  isUserUploadsPath,
  rewriteProtectedMessageMediaUrlToCanonical,
} from "~/shared/lib/user-uploads-url.lib";
import {
  getMessageImagesBaseUrl,
  getMessageRealmBaseUrl,
} from "~/shared/lib/zulip-message-media-base.lib";

interface MessageMediaBaseUrls {
  realmBase?: string;
  uploadsBase?: string;
}

function normalizeMessageMediaBase(baseUrl?: string): string | undefined {
  const trimmed = baseUrl?.trim().replace(/\/+$/, "");
  if (trimmed == null || trimmed.length === 0) {
    return undefined;
  }
  return trimmed;
}

function deriveRealmBaseFromMediaBase(baseUrl?: string): string | undefined {
  const normalizedBase = normalizeMessageMediaBase(baseUrl);
  if (normalizedBase == null) {
    return undefined;
  }
  const prefix = env.USER_UPLOADS_PATH_PREFIX.trim().replace(/\/+$/, "");
  if (prefix !== "" && normalizedBase.endsWith(prefix)) {
    const stripped = normalizedBase.slice(0, -prefix.length).replace(/\/+$/, "");
    return stripped.length > 0 ? stripped : undefined;
  }
  return normalizedBase;
}

/** Infer realm/upload bases on `file://` when explicit `baseUrl` is missing. */
function resolveSanitizeMediaBaseUrls(html: string, baseUrl?: string): MessageMediaBaseUrls {
  const explicitUploadsBase = normalizeMessageMediaBase(baseUrl);
  const uploadsBase =
    explicitUploadsBase ??
    (html.includes("/user_uploads/") ? getMessageImagesBaseUrl() : undefined);
  const explicitRealmBase = deriveRealmBaseFromMediaBase(baseUrl);
  const realmBase =
    explicitRealmBase ??
    deriveRealmBaseFromMediaBase(uploadsBase) ??
    (html.includes("/external_content/") || html.includes("/user_uploads/")
      ? getMessageRealmBaseUrl()
      : undefined);
  return { realmBase, uploadsBase };
}

let messageSanitizeHooksInstalled = false;

function ensureMessageLinkTargetHooks(): void {
  if (messageSanitizeHooksInstalled) return;
  messageSanitizeHooksInstalled = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    // Open all message links in a new browsing context (external and internal).
    if (node.tagName !== "A" || !node.hasAttribute("href")) return;
    const href = node.getAttribute("href")?.trim() ?? "";
    if (href === "") return;
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  });
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

const MESSAGE_ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "del",
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
  "picture",
  "img",
  "audio",
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

// Event handlers are never allowlisted; message rendering also depends on selected data attrs.
const MESSAGE_ADD_ATTR = [
  "src",
  "alt",
  "width",
  "height",
  "title",
  "class",
  "controls",
  "preload",
  "poster",
  "type",
  "data-original-url",
  "data-original-dimensions",
  "data-original-content-type",
  "colspan",
  "rowspan",
  "data-user-id",
  "data-user-group-id",
];

export function resolveMessageMediaUrl(src: string, baseUrl: string): string {
  const trimmedBase = baseUrl.trim();
  if (trimmedBase === "") return src;
  const base = trimmedBase.replace(/\/+$/, "");
  const s = src.trim();
  if (
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("data:") ||
    s.startsWith("blob:")
  ) {
    return s;
  }
  return s.startsWith("/") ? `${base}${s}` : `${base}/${s}`;
}

function rewriteCanonicalMessageMediaUrl(url: string, bases: MessageMediaBaseUrls): string {
  if (isUserUploadsPath(url)) {
    return bases.uploadsBase != null
      ? rewriteProtectedMessageMediaUrlToCanonical(url, bases.uploadsBase)
      : url;
  }
  if (isExternalContentPath(url)) {
    return bases.realmBase != null
      ? rewriteProtectedMessageMediaUrlToCanonical(url, bases.realmBase)
      : url;
  }
  return url;
}

/** Rewrites wrong-host absolute protected media URLs to the canonical base. */
function rewriteCanonicalProtectedMessageMediaAttrs(
  html: string,
  bases: MessageMediaBaseUrls,
): string {
  if (bases.uploadsBase == null && bases.realmBase == null) return html;

  let result = html.replace(
    /<(?:img|audio|video|source)\s[^>]*?src=(["'])([^"']+)\1/gi,
    (match, _q, src) => match.replace(src, rewriteCanonicalMessageMediaUrl(src, bases)),
  );
  result = result.replace(/<video\s[^>]*?poster=(["'])([^"']+)\1/gi, (match, _q, poster) =>
    match.replace(poster, rewriteCanonicalMessageMediaUrl(poster, bases)),
  );
  result = result.replace(/<a\s[^>]*?href=(["'])([^"']+)\1/gi, (match, _q, href) => {
    if (!isUserUploadsPath(href) && !isExternalContentPath(href)) return match;
    return match.replace(href, rewriteCanonicalMessageMediaUrl(href, bases));
  });
  return result;
}

function resolveRelativeProtectedMessageMediaUrl(src: string, bases: MessageMediaBaseUrls): string {
  const s = src.trim();
  if (
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("data:") ||
    s.startsWith("blob:")
  ) {
    return s;
  }
  if (s.startsWith("/user_uploads/") && bases.uploadsBase != null) {
    return `${bases.uploadsBase}${s}`;
  }
  if (s.startsWith("/external_content/") && bases.realmBase != null) {
    return `${bases.realmBase}${s}`;
  }
  const fallbackBase = bases.realmBase ?? bases.uploadsBase;
  return fallbackBase != null ? resolveMessageMediaUrl(s, fallbackBase) : s;
}

function rewriteRelativeMediaSrc(html: string, bases: MessageMediaBaseUrls): string {
  if (bases.uploadsBase == null && bases.realmBase == null) return html;

  const rewriteAttr = (_match: string, _quote: string, src: string) => {
    const absolute = resolveRelativeProtectedMessageMediaUrl(src, bases);
    return _match.replace(src, absolute);
  };

  let result = html.replace(
    /<(?:img|audio|video|source)\s[^>]*?src=(["'])([^"']+)\1/gi,
    rewriteAttr,
  );
  result = result.replace(/<video\s[^>]*?poster=(["'])([^"']+)\1/gi, rewriteAttr);
  return result;
}

export function sanitizeHtml(html: string, baseUrl?: string): string {
  ensureMessageLinkTargetHooks();
  const effectiveBases = resolveSanitizeMediaBaseUrls(html, baseUrl);
  const withCanonicalMedia = rewriteCanonicalProtectedMessageMediaAttrs(html, effectiveBases);
  const toSanitize = rewriteRelativeMediaSrc(withCanonicalMedia, effectiveBases);
  return DOMPurify.sanitize(toSanitize, {
    ALLOWED_TAGS: MESSAGE_ALLOWED_TAGS,
    ADD_ATTR: MESSAGE_ADD_ATTR,
  });
}

export function sanitizeHtmlToFragment(html: string, baseUrl?: string): DocumentFragment | null {
  if (typeof document === "undefined") {
    return null;
  }
  ensureMessageLinkTargetHooks();
  const effectiveBases = resolveSanitizeMediaBaseUrls(html, baseUrl);
  const withCanonicalMedia = rewriteCanonicalProtectedMessageMediaAttrs(html, effectiveBases);
  const toSanitize = rewriteRelativeMediaSrc(withCanonicalMedia, effectiveBases);
  return DOMPurify.sanitize(toSanitize, {
    ALLOWED_TAGS: MESSAGE_ALLOWED_TAGS,
    ADD_ATTR: MESSAGE_ADD_ATTR,
    RETURN_DOM_FRAGMENT: true,
  });
}
