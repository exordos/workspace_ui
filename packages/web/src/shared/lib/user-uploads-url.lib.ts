// Канонический URL для медиа из сообщений Zulip,
// которые отдаются из static-path от realm-root, например `/user_uploads/` и `/external_content/`.
//
// В HTML сообщения могут встречаться абсолютные ссылки на gateway или legacy-host,
// который не умеет отдавать файлы, например отвечает `501`.
// Переписывание на корректную realm/static-базу выравнивает поведение
// между SPA, Electron `file://` и Vite dev-proxy.

const USER_UPLOADS_SEGMENT = "/user_uploads/";
const EXTERNAL_CONTENT_SEGMENT = "/external_content/";
const PROTECTED_MESSAGE_MEDIA_SEGMENTS = [USER_UPLOADS_SEGMENT, EXTERNAL_CONTENT_SEGMENT] as const;

// Схлопывает ошибочные повторения `/workspace/v1/workspace/v1/` в upload-URL.
export function collapseDuplicateWorkspaceV1InUrl(raw: string): string {
  let s = raw.trim();
  while (s.includes("/workspace/v1/workspace/v1")) {
    s = s.replace(/\/workspace\/v1\/workspace\/v1/g, "/workspace/v1");
  }
  return s;
}

// Базовый URL для резолва относительных путей,
// когда `window` недоступен.
export function getDefaultUrlParseBase(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "https://localhost";
}

function pathnameFromFirstProtectedMessageMediaSegment(pathname: string): string {
  let bestIndex = -1;
  for (const segment of PROTECTED_MESSAGE_MEDIA_SEGMENTS) {
    const idx = pathname.indexOf(segment);
    if (idx === -1) continue;
    if (bestIndex === -1 || idx < bestIndex) {
      bestIndex = idx;
    }
  }
  if (bestIndex === -1) return pathname;
  return pathname.slice(bestIndex);
}

export function isUserUploadsPath(pathname: string): boolean {
  return pathname.includes(USER_UPLOADS_SEGMENT);
}

export function isExternalContentPath(pathname: string): boolean {
  return pathname.includes(EXTERNAL_CONTENT_SEGMENT);
}

export function isProtectedMessageMediaPath(pathname: string): boolean {
  return isUserUploadsPath(pathname) || isExternalContentPath(pathname);
}

// Возвращает `/(user_uploads|external_content)/...` вместе с query string
// из полного или относительного URL.
// Если это не protected media-path из Zulip, возвращает null.
export function extractProtectedMessageMediaPathAndQuery(
  raw: string,
  base: string = getDefaultUrlParseBase(),
): string | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  try {
    const parsed = new URL(value, base);
    if (!isProtectedMessageMediaPath(parsed.pathname)) return null;
    let normalizedPath = parsed.pathname.replace(
      /^\/api\/v1(?=\/(?:user_uploads|external_content)\/)/,
      "",
    );
    normalizedPath = pathnameFromFirstProtectedMessageMediaSegment(normalizedPath);
    return `${normalizedPath}${parsed.search}`;
  } catch {
    if (isProtectedMessageMediaPath(value)) {
      try {
        const parsed = new URL(value, base);
        let normalizedPath = parsed.pathname.replace(
          /^\/api\/v1(?=\/(?:user_uploads|external_content)\/)/,
          "",
        );
        normalizedPath = pathnameFromFirstProtectedMessageMediaSegment(normalizedPath);
        return `${normalizedPath}${parsed.search}`;
      } catch {
        const stripped = value.replace(/^\/api\/v1(?=\/(?:user_uploads|external_content)\/)/, "");
        const q = stripped.indexOf("?");
        const pathOnly = q === -1 ? stripped : stripped.slice(0, q);
        const search = q === -1 ? "" : stripped.slice(q);
        return `${pathnameFromFirstProtectedMessageMediaSegment(pathOnly)}${search}`;
      }
    }
  }
  return null;
}

// Возвращает `/user_uploads/...` вместе с query string из полного или относительного URL.
// Если это не upload path, возвращает null.
export function extractUserUploadsPathAndQuery(
  raw: string,
  base: string = getDefaultUrlParseBase(),
): string | null {
  const pathAndQuery = extractProtectedMessageMediaPathAndQuery(raw, base);
  return pathAndQuery != null && isUserUploadsPath(pathAndQuery) ? pathAndQuery : null;
}

// Переписывает любой URL вида `.../(user_uploads|external_content)/...`
// так, чтобы он жил под `canonicalBase`.
// Относительные пути резолвятся через эту базу.
// Абсолютные URL, которые не относятся к media из сообщений, остаются без изменений.
export function rewriteProtectedMessageMediaUrlToCanonical(
  src: string,
  canonicalBase: string,
): string {
  const base = canonicalBase.trim().replace(/\/+$/, "");
  if (base === "") return src;
  const trimmed = src.trim();
  if (!isProtectedMessageMediaPath(trimmed)) return src;
  if (trimmed.startsWith("data:")) return trimmed;

  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return trimmed.startsWith("/") ? `${base}${trimmed}` : `${base}/${trimmed}`;
  }

  const pathAndQuery = extractProtectedMessageMediaPathAndQuery(trimmed, base);
  if (!pathAndQuery) return src;
  return collapseDuplicateWorkspaceV1InUrl(`${base}${pathAndQuery}`);
}

// Переписывает любой `.../user_uploads/...` URL так,
// чтобы он жил под `canonicalUploadsBase`, то есть realm плюс необязательный gateway-префикс.
// Относительные пути резолвятся через эту базу.
// Абсолютные URL, не относящиеся к upload, остаются без изменений.
export function rewriteUserUploadMediaUrlToCanonical(
  src: string,
  canonicalUploadsBase: string,
): string {
  const base = canonicalUploadsBase.trim().replace(/\/+$/, "");
  if (base === "") return src;
  const trimmed = src.trim();
  if (!isUserUploadsPath(trimmed)) return src;
  if (trimmed.startsWith("data:")) return trimmed;

  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return trimmed.startsWith("/") ? `${base}${trimmed}` : `${base}/${trimmed}`;
  }

  const pathAndQuery = extractUserUploadsPathAndQuery(trimmed, base);
  if (!pathAndQuery) return src;
  return collapseDuplicateWorkspaceV1InUrl(`${base}${pathAndQuery}`);
}
