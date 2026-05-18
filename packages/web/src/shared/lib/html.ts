// Санитизация HTML для содержимого сообщений Zulip.
//
// Использует DOMPurify со строгим allowlist по тегам и атрибутам.
// Переписывает относительные `<img src>` в абсолютные URL на основе realm base URL.
// Внешние и внутренние ссылки открываются в новом контексте
// с `target="_blank"` и `rel="noopener noreferrer"`.
//
// Использование:
//   import { sanitizeHtml, stripHtml } from "~/lib/html";
//   const safe = sanitizeHtml(message.content, getRealmBaseUrl());
//   const plain = stripHtml(message.content);
//
// Если `baseUrl` не передан, но HTML содержит `/user_uploads/`,
// base для realm будет определена автоматически, что безопасно для Electron `file://`.
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

// Если `baseUrl` не передан, например в Electron shell на `file://`,
// нужно правильно резолвить `/user_uploads/` и `/external_content/`
// через realm/static base, чтобы URL не превращались в `file:///...`.
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
    // Любые ссылки в сообщениях открываем безопасно в новом контексте.
    // Это единое правило для внешних и внутренних ссылок из Zulip HTML.
    if (node.tagName !== "A" || !node.hasAttribute("href")) return;
    const href = node.getAttribute("href")?.trim() ?? "";
    if (href === "") return;
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  });
}

// Удаляет из строки все HTML-теги, например для копирования текста сообщения в буфер.
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

const MESSAGE_ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  // Нужен для markdown strikethrough (`~~text~~` -> `<del>`).
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

// Разрешаем только нужные для контента атрибуты.
// Важно: сюда не добавляем обработчики событий и style, чтобы не открыть XSS-вектор.
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
  // Разметка упоминаний пользователей и групп в Zulip:
  // `span.user-mention`, `span.user-group-mention`.
  "data-user-id",
  "data-user-group-id",
];

// Резолвит относительный media URL сообщения (`img`, `video`, `poster`)
// в абсолютный через realm base или uploads base.
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

// Переписывает абсолютные protected media URL,
// если они указывают на неправильный host, в canonical base.
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

// Переписывает относительные `src` / `poster` в абсолютные URL
// через корректные Zulip media base.
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

// Санитизирует HTML сообщения Zulip для безопасного рендера:
// удаляет опасные теги и переписывает относительные media URL.
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
