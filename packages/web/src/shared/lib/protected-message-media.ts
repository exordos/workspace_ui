/**
 * Authorized fetch helpers for the messenger API protected message media.
 *
 * Live DOM must not keep protected URLs in `src`/`poster`/etc.; candidates live in `data-auth-*`
 * until `fetch → blob/data:` assigns display URLs.
 */
import hljs from "highlight.js/lib/common";
import {
  appendDevRealmMediaProxyHeaders,
  appendDevWorkspaceApiProxyHeaders,
} from "~/shared/api/client";
import { getRealmBaseUrl } from "~/shared/api/messenger-client.internal";
import {
  appendUserUploadsPathPrefix,
  normalizeRealmSiteOriginForUploads,
  shouldApplyUserUploadsPathPrefixForRealmBase,
} from "~/shared/api/messenger-realm.internal";
import { resolveAvatarUrl } from "~/shared/lib/avatar";
import { env } from "~/shared/lib/env";
import { sanitizeHtml } from "~/shared/lib/html";
import { isImageFileName } from "~/shared/lib/media-file-name.lib";
import { MESSAGE_MEDIA_PREVIEW_CLASS_NAME } from "~/shared/lib/message-body-rich-text-classes";
import { renderEmojiShortcodesInContainer } from "~/shared/lib/message-emoji-shortcodes.lib";
import {
  collectMessageInlineImageIdentitiesFromContainer,
  normalizeUserUploadImageIdentity,
  shouldSkipInliningUserUploadImageLink,
} from "~/shared/lib/message-inline-user-upload-image.lib";
import { upgradeUserUploadVideoLinksInContainer } from "~/shared/lib/message-inline-user-upload-video.lib";
import {
  isUserUploadImagePath,
  isUserUploadThumbnailUrl,
  toUserUploadOriginalUrl,
  toUserUploadThumbnailUrl,
  USER_UPLOAD_THUMBNAIL_DISPLAY_MAX_HEIGHT,
  USER_UPLOAD_THUMBNAIL_DISPLAY_MAX_WIDTH,
} from "~/shared/lib/protected-message-media-thumbnail";
import { userUploadVideoMimeType } from "~/shared/lib/user-upload-media-path.lib";
import {
  collapseDuplicateWorkspaceV1InUrl,
  extractProtectedMessageMediaPathAndQuery,
  isExternalContentPath,
  isProtectedMessageMediaPath,
  isUserUploadsPath,
  isWorkspaceFileDownloadPath,
} from "~/shared/lib/user-uploads-url.lib";
import { parseWorkspaceFileUrn, type WorkspaceFileUrn } from "~/shared/lib/workspace-file-urn.lib";

export { collapseDuplicateWorkspaceV1InUrl };

export const AUTH_MEDIA_SRC_DATA_ATTR = "data-auth-src";
export const AUTH_MEDIA_POSTER_DATA_ATTR = "data-auth-poster";
export const AUTH_MEDIA_BACKGROUND_IMAGE_DATA_ATTR = "data-auth-background-image";

export interface PrepareProtectedMessageHtmlOptions {
  resolveCustomEmojiShortcodeImageUrl?: (shortcode: string) => string | undefined;
}

export type TrustedProtectedMediaOrigins = ReadonlySet<string>;

type WorkspaceEntityUrnKind = "user" | "message" | "stream" | "topic";

interface WorkspaceEntityUrn {
  kind: WorkspaceEntityUrnKind;
  uuid: string;
  original: string;
}

const LANGUAGE_CLASS_PATTERN = /\b(?:language|lang)-([a-z0-9#+-]+)\b/i;
const LANGUAGE_ALIASES: Record<string, string> = {
  cjs: "javascript",
  jsx: "javascript",
  py: "python",
  sh: "bash",
  ts: "typescript",
  tsx: "typescript",
};
const DEFAULT_SPOILER_HEADER = "Spoiler";
const WORKSPACE_GAVATAR_URN_PREFIX = "urn:gavatar:";
const WORKSPACE_ENTITY_URN_RE =
  /^urn:(user|message|stream|topic):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const WORKSPACE_URL_URN_PREFIX = "urn:url:";
const HTTP_URL_RE = /^https?:\/\//i;

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

/** Inline SVG placeholder icon only; box fill comes from `.message-media-preview` CSS. */
const AUTH_IMAGE_PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160" aria-hidden="true">
  <rect x="78" y="48" width="84" height="44" rx="5" fill="none" stroke="#8b8b93" stroke-opacity="0.4" stroke-width="1.25"/>
  <circle cx="96" cy="60" r="5" fill="#8b8b93" fill-opacity="0.4"/>
  <path d="M84 84 L108 68 L126 80 L144 64 L156 84 Z" fill="#8b8b93" fill-opacity="0.26"/>
  <line x1="72" y1="112" x2="168" y2="112" stroke="#8b8b93" stroke-opacity="0.28" stroke-width="2" stroke-linecap="round"/>
</svg>`;

function markMessageMediaPreview(img: HTMLImageElement): void {
  img.classList.add(MESSAGE_MEDIA_PREVIEW_CLASS_NAME);
}

export const AUTH_IMAGE_PLACEHOLDER_SRC = `data:image/svg+xml,${encodeURIComponent(AUTH_IMAGE_PLACEHOLDER_SVG)}`;

export function isAuthMediaPlaceholderAttr(value: string | null): boolean {
  if (value == null || value === "") return true;
  return value === AUTH_IMAGE_PLACEHOLDER_SRC;
}

function getWindowOrigin(): string | null {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  if (origin === "" || origin === "null") {
    return null;
  }
  return origin;
}

function getTrustedProtectedMediaOrigins(
  additionalOrigins?: Iterable<string>,
): TrustedProtectedMediaOrigins {
  const origins = new Set<string>();
  const windowOrigin = getWindowOrigin();
  if (windowOrigin != null) {
    origins.add(windowOrigin);
  }

  const site = normalizeRealmSiteOriginForUploads(getRealmBaseUrl()).trim().replace(/\/+$/, "");
  if (site !== "") {
    try {
      origins.add(new URL(site).origin);
    } catch {
      // Invalid realm config should not make absolute external media trusted.
    }
  }

  for (const origin of additionalOrigins ?? []) {
    try {
      origins.add(new URL(origin).origin);
    } catch {
      // Invalid caller-provided media base must not extend protected media trust.
    }
  }

  return origins;
}

function getUrlOrigin(url: string | undefined): string | null {
  const value = url?.trim();
  if (value == null || value.length === 0) {
    return null;
  }
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function parseProtectedMessageMediaUrl(url: string): URL | null {
  const value = url.trim();
  if (value.length === 0) return null;
  const base = getWindowOrigin() ?? "https://localhost";
  try {
    const parsed = new URL(value, base);
    return isProtectedMessageMediaPath(parsed.pathname) ? parsed : null;
  } catch {
    return null;
  }
}

const RELATIVE_URL_PARSE_BASE_A = "https://relative-a.invalid/base/";
const RELATIVE_URL_PARSE_BASE_B = "https://relative-b.invalid/other/";

function parseRelativeUrlLike(value: string): URL | null {
  try {
    const parsedA = new URL(value, RELATIVE_URL_PARSE_BASE_A);
    const parsedB = new URL(value, RELATIVE_URL_PARSE_BASE_B);
    return parsedA.href === parsedB.href ? null : parsedA;
  } catch {
    return null;
  }
}

function isTrustedProtectedMessageMediaUrl(
  url: string,
  trustedOrigins?: TrustedProtectedMediaOrigins,
): boolean {
  const value = url.trim();
  if (value.length === 0) return false;

  const relative = parseRelativeUrlLike(value);
  if (relative != null) {
    return isProtectedMessageMediaPath(relative.pathname);
  }

  const parsed = parseProtectedMessageMediaUrl(value);
  if (parsed == null) return false;
  return (trustedOrigins ?? getTrustedProtectedMediaOrigins()).has(parsed.origin);
}

export function isProtectedUserUploadUrl(
  url: string,
  trustedOrigins?: TrustedProtectedMediaOrigins,
): boolean {
  if (!isTrustedProtectedMessageMediaUrl(url, trustedOrigins)) return false;
  const parsed = parseProtectedMessageMediaUrl(url);
  return parsed != null ? isUserUploadsPath(parsed.pathname) : isUserUploadsPath(url.trim());
}

export function isProtectedMessageMediaUrl(
  url: string,
  trustedOrigins?: TrustedProtectedMediaOrigins,
): boolean {
  return isTrustedProtectedMessageMediaUrl(url, trustedOrigins);
}

function isWorkspaceFileDownloadImageLink(link: HTMLAnchorElement, href: string): boolean {
  const parsed = parseProtectedMessageMediaUrl(href);
  if (parsed == null || !isWorkspaceFileDownloadPath(parsed.pathname)) return false;
  const contentType = link.dataset.originalContentType?.trim().toLowerCase() ?? "";
  if (contentType.startsWith("image/")) return true;
  return [
    link.textContent ?? "",
    link.getAttribute("title") ?? "",
    link.getAttribute("download") ?? "",
  ].some(isImageFileName);
}

export function normalizeProtectedUploadPath(url: string): string | null {
  return extractProtectedMessageMediaPathAndQuery(url);
}

function parseSrcsetCandidates(srcset: string): string[] {
  return srcset
    .split(",")
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0)
    .map((candidate) => candidate.split(/\s+/)[0] ?? "")
    .filter((candidate) => candidate.length > 0);
}

function getProtectedSrcsetCandidate(
  srcset: string | null,
  trustedOrigins?: TrustedProtectedMediaOrigins,
): string | null {
  if (srcset == null || srcset.trim() === "") return null;
  const candidates = parseSrcsetCandidates(srcset);
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (candidate != null && isProtectedMessageMediaUrl(candidate, trustedOrigins)) {
      return collapseDuplicateWorkspaceV1InUrl(candidate);
    }
  }
  return null;
}

function getProtectedSrcCandidate(
  element: Element,
  trustedOrigins?: TrustedProtectedMediaOrigins,
): string | null {
  const src = element.getAttribute("src");
  if (src != null && src.trim() !== "") {
    if (isProtectedMessageMediaUrl(src, trustedOrigins)) {
      return collapseDuplicateWorkspaceV1InUrl(src);
    }
    return null;
  }
  return getProtectedSrcsetCandidate(element.getAttribute("srcset"), trustedOrigins);
}

function getProtectedBackgroundImageCandidate(
  styleValue: string | null,
  trustedOrigins?: TrustedProtectedMediaOrigins,
): string | null {
  if (styleValue == null || styleValue.trim() === "") return null;
  const match = /background-image\s*:\s*url\(\s*(?:"([^"]+)"|'([^']+)'|([^)"']+))\s*\)/i.exec(
    styleValue,
  );
  const candidate = match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
  if (candidate === "" || !isProtectedMessageMediaUrl(candidate, trustedOrigins)) {
    return null;
  }
  return collapseDuplicateWorkspaceV1InUrl(candidate);
}

function stripInlineStyleAttr(element: Element): void {
  element.removeAttribute("style");
}

function hasProtectedMessageMediaInStyle(styleValue: string | null): boolean {
  if (styleValue == null || styleValue.trim() === "") return false;
  return (
    styleValue.includes("/user_uploads/") ||
    styleValue.includes("/external_content/") ||
    styleValue.includes("/api/messenger/v1/files/")
  );
}

function stripResponsiveMediaAttrs(element: Element): void {
  if (
    element instanceof HTMLImageElement ||
    element instanceof HTMLSourceElement ||
    element instanceof HTMLVideoElement
  ) {
    element.removeAttribute("srcset");
    element.removeAttribute("sizes");
  }
}

function prepareProtectedGenericMediaElement(
  element: HTMLMediaElement | HTMLSourceElement,
  srcAttrValue: string,
): void {
  element.setAttribute(AUTH_MEDIA_SRC_DATA_ATTR, collapseDuplicateWorkspaceV1InUrl(srcAttrValue));
  element.removeAttribute("src");
}

/**
 * Swaps `<img src>` for placeholder + `data-auth-src` so the browser does not fetch
 * protected URLs during `innerHTML` parse before authorized fetch runs.
 */
export function prepareProtectedUserUploadImageElement(
  img: HTMLImageElement,
  srcAttrValue: string,
): void {
  const collapsedSrc = collapseDuplicateWorkspaceV1InUrl(srcAttrValue);
  const fullResolutionSrc = toUserUploadOriginalUrl(collapsedSrc);
  const useThumb = isUserUploadImagePath(collapsedSrc) && !isUserUploadThumbnailUrl(collapsedSrc);
  const authFetchSrc = useThumb ? toUserUploadThumbnailUrl(collapsedSrc) : collapsedSrc;

  stripInlineStyleAttr(img);
  stripResponsiveMediaAttrs(img);
  img.setAttribute(AUTH_MEDIA_SRC_DATA_ATTR, authFetchSrc);
  img.dataset.originalSrc = fullResolutionSrc;
  img.setAttribute("src", AUTH_IMAGE_PLACEHOLDER_SRC);
  if (isUserUploadThumbnailUrl(authFetchSrc)) {
    img.setAttribute("width", String(USER_UPLOAD_THUMBNAIL_DISPLAY_MAX_WIDTH));
    img.setAttribute("height", String(USER_UPLOAD_THUMBNAIL_DISPLAY_MAX_HEIGHT));
  }
  markMessageMediaPreview(img);
}

function prepareProtectedMessageImageElement(
  img: HTMLImageElement,
  srcAttrValue: string,
  trustedOrigins?: TrustedProtectedMediaOrigins,
): void {
  if (isProtectedUserUploadUrl(srcAttrValue, trustedOrigins)) {
    prepareProtectedUserUploadImageElement(img, srcAttrValue);
    return;
  }
  const collapsedSrc = collapseDuplicateWorkspaceV1InUrl(srcAttrValue);
  stripInlineStyleAttr(img);
  stripResponsiveMediaAttrs(img);
  img.setAttribute(AUTH_MEDIA_SRC_DATA_ATTR, collapsedSrc);
  img.dataset.originalSrc = collapsedSrc;
  img.setAttribute("src", AUTH_IMAGE_PLACEHOLDER_SRC);
  img.setAttribute("width", String(USER_UPLOAD_THUMBNAIL_DISPLAY_MAX_WIDTH));
  img.setAttribute("height", String(USER_UPLOAD_THUMBNAIL_DISPLAY_MAX_HEIGHT));
  markMessageMediaPreview(img);
}

function protectPictureElement(
  picture: HTMLPictureElement,
  trustedOrigins?: TrustedProtectedMediaOrigins,
): void {
  const image = picture.querySelector("img");
  const imageSrc = image?.getAttribute("src")?.trim() ?? "";
  const imageHasPublicSrc =
    imageSrc !== "" && !isProtectedMessageMediaUrl(imageSrc, trustedOrigins);
  const imageCandidate = image != null ? getProtectedSrcCandidate(image, trustedOrigins) : null;
  const sourceCandidates = Array.from(picture.querySelectorAll("source"))
    .map((source) => getProtectedSrcCandidate(source, trustedOrigins))
    .filter((candidate): candidate is string => candidate != null);

  for (const source of picture.querySelectorAll("source")) {
    stripInlineStyleAttr(source);
    stripResponsiveMediaAttrs(source);
    source.removeAttribute("src");
  }

  if (image == null) return;
  if (imageHasPublicSrc) {
    stripInlineStyleAttr(image);
    if (getProtectedSrcsetCandidate(image.getAttribute("srcset"), trustedOrigins) != null) {
      stripResponsiveMediaAttrs(image);
    }
    return;
  }
  const chosenCandidate = imageCandidate ?? sourceCandidates[sourceCandidates.length - 1] ?? null;
  if (chosenCandidate == null) {
    stripInlineStyleAttr(image);
    return;
  }
  prepareProtectedMessageImageElement(image, chosenCandidate, trustedOrigins);
}

function protectEmbedBackgroundImageElement(
  element: HTMLElement,
  trustedOrigins?: TrustedProtectedMediaOrigins,
): void {
  const candidate = getProtectedBackgroundImageCandidate(
    element.getAttribute("style"),
    trustedOrigins,
  );
  if (candidate == null) {
    return;
  }

  stripInlineStyleAttr(element);
  element.setAttribute(AUTH_MEDIA_BACKGROUND_IMAGE_DATA_ATTR, candidate);
}

function protectStyleAttr(
  element: HTMLElement,
  trustedOrigins?: TrustedProtectedMediaOrigins,
): void {
  const styleValue = element.getAttribute("style");
  if (!hasProtectedMessageMediaInStyle(styleValue)) {
    return;
  }
  if (element.classList.contains("message_embed_image")) {
    protectEmbedBackgroundImageElement(element, trustedOrigins);
    return;
  }
  stripInlineStyleAttr(element);
}

export function buildProtectedUploadFetchUrl(url: string): string {
  const value = collapseDuplicateWorkspaceV1InUrl(url);
  const normalizedPath = normalizeProtectedUploadPath(value);
  if (!normalizedPath) {
    return value;
  }
  if (isWorkspaceFileDownloadPath(normalizedPath)) {
    return normalizedPath;
  }
  const realm = getRealmBaseUrl();
  const site = normalizeRealmSiteOriginForUploads(realm).trim().replace(/\/+$/, "");
  const prefix = env.USER_UPLOADS_PATH_PREFIX;
  let uploadsBase = "";
  if (site !== "") {
    uploadsBase = shouldApplyUserUploadsPathPrefixForRealmBase(realm, site)
      ? appendUserUploadsPathPrefix(site, prefix)
      : site;
  }
  const canonicalBase = isExternalContentPath(normalizedPath) ? site : uploadsBase;
  const canonicalFull =
    canonicalBase !== ""
      ? collapseDuplicateWorkspaceV1InUrl(`${canonicalBase}${normalizedPath}`)
      : "";

  const useRelativeDevProxy =
    env.DEV && env.MODE === "development" && typeof window !== "undefined";
  if (useRelativeDevProxy) {
    return collapseDuplicateWorkspaceV1InUrl(normalizedPath);
  }

  if (canonicalFull !== "") {
    return canonicalFull;
  }
  return value.length > 0 ? value : collapseDuplicateWorkspaceV1InUrl(normalizedPath);
}

/** Cross-origin protected media: Bearer-authenticated requests can omit cookies. */
function resolveCrossOriginProtectedUploadCredentials(
  headers: Record<string, string>,
): RequestCredentials {
  const authorization = headers.Authorization?.trim() ?? "";
  return authorization.length > 0 ? "omit" : "include";
}

function resolveProtectedUploadRequestHeaders(
  candidate: string,
  headers: Record<string, string>,
): Record<string, string> {
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://localhost";
    const parsed = new URL(candidate, base);
    if (isWorkspaceFileDownloadPath(parsed.pathname)) {
      return appendDevWorkspaceApiProxyHeaders(candidate, headers);
    }
  } catch {
    // Fall back to realm media proxy handling below.
  }
  return appendDevRealmMediaProxyHeaders(candidate, headers);
}

export function resolveProtectedUploadFetchOptions(
  candidate: string,
  headers: Record<string, string>,
): RequestInit {
  const isProtectedCandidate = isProtectedMessageMediaUrl(candidate);
  const requestHeaders = isProtectedCandidate
    ? resolveProtectedUploadRequestHeaders(candidate, headers)
    : {};
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://localhost";
    const parsed = new URL(candidate, base);
    const isCrossOrigin = typeof window !== "undefined" && parsed.origin !== window.location.origin;
    if (isCrossOrigin) {
      return {
        headers: requestHeaders,
        credentials: isProtectedCandidate
          ? resolveCrossOriginProtectedUploadCredentials(requestHeaders)
          : "omit",
      };
    }
  } catch {
    // Fall back to same-origin defaults when URL parsing fails.
  }
  return { headers: requestHeaders, credentials: "include" };
}

export async function fetchProtectedUploadBlob(
  rawValue: string,
  headers: Record<string, string>,
): Promise<Blob | null> {
  if (!isProtectedMessageMediaUrl(rawValue)) {
    return null;
  }

  const fetchUrl = buildProtectedUploadFetchUrl(rawValue);
  try {
    const response = await fetch(fetchUrl, resolveProtectedUploadFetchOptions(fetchUrl, headers));
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

/** Cap inline `data:` size when a full file slips through on `file://`. */
const FILE_PROTOCOL_BLOB_AS_DATA_URL_MAX_BYTES = 15 * 1024 * 1024;

/** Prefer `data:` over `blob:file:///` for small blobs in packaged Electron. */
export async function createDisplayableBlobUrl(
  blob: Blob,
  revokeRegistry: string[],
): Promise<string> {
  const preferDataUrl =
    typeof window !== "undefined" &&
    window.location.protocol === "file:" &&
    blob.size <= FILE_PROTOCOL_BLOB_AS_DATA_URL_MAX_BYTES;

  if (!preferDataUrl) {
    const url = URL.createObjectURL(blob);
    revokeRegistry.push(url);
    return url;
  }

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const r = reader.result;
      if (typeof r === "string") {
        resolve(r);
        return;
      }
      reject(reader.error ?? new Error("FileReader: expected data URL string"));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("FileReader failed"));
    };
    reader.readAsDataURL(blob);
  });
}

export async function fetchProtectedUploadDisplayUrl(
  rawValue: string,
  headers: Record<string, string>,
  revokeRegistry: string[],
): Promise<string | null> {
  const blob = await fetchProtectedUploadBlob(rawValue, headers);
  if (!blob) return null;
  try {
    return await createDisplayableBlobUrl(blob, revokeRegistry);
  } catch {
    return null;
  }
}

function applySyntaxHighlightingInContainer(container: ParentNode): void {
  const codeBlocks = container.querySelectorAll("pre code");
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
}

function normalizeWorkspaceSpoilerBlocksInContainer(container: ParentNode): void {
  const spoilerBlocks = container.querySelectorAll<HTMLElement>(".spoiler-block");
  for (const block of spoilerBlocks) {
    const header = block.querySelector<HTMLElement>(".spoiler-header");
    const content = block.querySelector<HTMLElement>(".spoiler-content");
    if (content == null) continue;

    if (header == null) {
      const fallbackHeader = document.createElement("div");
      fallbackHeader.classList.add("spoiler-header");
      fallbackHeader.textContent = DEFAULT_SPOILER_HEADER;
      block.insertBefore(fallbackHeader, content);
      continue;
    }

    if ((header.textContent ?? "").trim().length === 0) {
      header.textContent = DEFAULT_SPOILER_HEADER;
    }
  }
}

function normalizeWorkspaceQuoteBlocksInContainer(container: ParentNode): void {
  const blockquotes = container.querySelectorAll<HTMLElement>("blockquote");
  for (const blockquote of blockquotes) {
    if (blockquote.classList.contains("messenger-quote-body")) continue;
    if (blockquote.closest(".messenger-quote-block") != null) continue;

    const previous = blockquote.previousElementSibling;
    if (previous == null) continue;

    const hasMention = previous.querySelector(".user-mention") != null;
    const wroteLink = previous.querySelector("a[href]");
    if (!hasMention && wroteLink == null) continue;

    const quoteBlock = document.createElement("div");
    quoteBlock.className = "messenger-quote-block";

    const header = document.createElement("div");
    header.className = "messenger-quote-header";
    header.innerHTML = previous.innerHTML;

    blockquote.classList.add("messenger-quote-body");
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
}

function collectInlineImageIdentityFromElement(element: Element): string | null {
  if (element instanceof HTMLAnchorElement) {
    return normalizeUserUploadImageIdentity(element.getAttribute("href") ?? "");
  }
  if (element instanceof HTMLImageElement) {
    const authSrc = element.getAttribute(AUTH_MEDIA_SRC_DATA_ATTR);
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

function removeDuplicateQuoteBlockInlineImages(container: ParentNode): void {
  for (const quoteBlock of container.querySelectorAll<HTMLElement>(".messenger-quote-block")) {
    const quoteBody = quoteBlock.querySelector(".messenger-quote-body");
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

function inlineUserUploadImageLinksInContainer(container: ParentNode): void {
  const inlineIdentities = collectMessageInlineImageIdentitiesFromContainer(container);
  const links = container.querySelectorAll<HTMLAnchorElement>("a[href]");
  for (const link of links) {
    const href = link.getAttribute("href")?.trim();
    if (href == null || href.length === 0) continue;
    const isUserUploadImage = isUserUploadImagePath(href);
    const isWorkspaceFileImage = !isUserUploadImage && isWorkspaceFileDownloadImageLink(link, href);
    if (!isUserUploadImage && !isWorkspaceFileImage) continue;
    if (link.querySelector("img") != null) continue;
    const inQuoteBody = link.closest(".messenger-quote-body") != null;
    if (
      isUserUploadImage &&
      !inQuoteBody &&
      shouldSkipInliningUserUploadImageLink(href, inlineIdentities)
    ) {
      continue;
    }

    const title = (link.textContent ?? "").trim();
    const fallbackLabel = title.length > 0 ? title : "image";
    const image = document.createElement("img");
    // Use an auth placeholder immediately so later DOM insertion cannot trigger unauthenticated loads.
    if (isUserUploadImage) {
      prepareProtectedUserUploadImageElement(image, href);
    } else {
      prepareProtectedMessageImageElement(image, href);
    }
    image.setAttribute("alt", fallbackLabel);
    image.setAttribute("title", fallbackLabel);
    link.replaceChildren(image);
  }

  removeDuplicateQuoteBlockInlineImages(container);
}

function setWorkspaceFileUrnMetadataAttrs(element: HTMLElement, urn: WorkspaceFileUrn): void {
  element.dataset.originalUrl = `urn:${urn.kind}:${urn.fileUuid}`;
  if (urn.contentType != null) {
    element.dataset.originalContentType = urn.contentType;
  }
  if (urn.width != null && urn.height != null) {
    element.dataset.originalDimensions = `${urn.width}x${urn.height}`;
  }
  if (element.getAttribute("title") == null && urn.name != null) {
    element.setAttribute("title", urn.name);
  }
}

function rewriteWorkspaceFileUrnLink(link: HTMLAnchorElement): boolean {
  const urn = parseWorkspaceFileUrn(link.getAttribute("href") ?? "");
  if (urn == null) return false;
  link.setAttribute("href", urn.downloadPath);
  setWorkspaceFileUrnMetadataAttrs(link, urn);
  if ((link.textContent ?? "").trim().length === 0 && urn.name != null) {
    link.textContent = urn.name;
  }
  return true;
}

function fillWorkspaceFileUrnImageLabel(image: HTMLImageElement, fileName: string): void {
  if ((image.getAttribute("alt") ?? "").trim().length === 0) {
    image.setAttribute("alt", fileName);
  }
  if ((image.getAttribute("title") ?? "").trim().length === 0) {
    image.setAttribute("title", fileName);
  }
}

function isWorkspaceFileVideoUrn(urn: WorkspaceFileUrn): boolean {
  return urn.kind === "video" || urn.contentType?.toLowerCase().startsWith("video/") === true;
}

function workspaceFileUrnVideoMimeType(urn: WorkspaceFileUrn): string {
  const contentType = urn.contentType?.trim().toLowerCase() ?? "";
  if (contentType.startsWith("video/")) return contentType;
  return userUploadVideoMimeType(urn.name ?? urn.downloadPath);
}

function replaceWorkspaceFileUrnImageWithVideo(
  image: HTMLImageElement,
  urn: WorkspaceFileUrn,
): void {
  const video = document.createElement("video");
  video.setAttribute("controls", "");
  video.setAttribute("preload", "metadata");
  setWorkspaceFileUrnMetadataAttrs(video, urn);

  const titleAttr = image.getAttribute("title")?.trim();
  const altAttr = image.getAttribute("alt")?.trim();
  const title = titleAttr != null && titleAttr.length > 0 ? titleAttr : altAttr;
  if (title != null && title.length > 0 && video.getAttribute("title") == null) {
    video.setAttribute("title", title);
  }

  const source = document.createElement("source");
  source.setAttribute("src", urn.downloadPath);
  source.setAttribute("type", workspaceFileUrnVideoMimeType(urn));
  video.appendChild(source);
  image.replaceWith(video);
}

function rewriteWorkspaceFileUrnMediaElement(element: HTMLElement): boolean {
  const urn = parseWorkspaceFileUrn(element.getAttribute("src") ?? "");
  if (urn == null) return false;
  if (element instanceof HTMLImageElement && isWorkspaceFileVideoUrn(urn)) {
    replaceWorkspaceFileUrnImageWithVideo(element, urn);
    return true;
  }
  element.setAttribute("src", urn.downloadPath);
  setWorkspaceFileUrnMetadataAttrs(element, urn);
  if (element instanceof HTMLImageElement && urn.name != null) {
    fillWorkspaceFileUrnImageLabel(element, urn.name);
  }
  if (
    (element instanceof HTMLSourceElement || element instanceof HTMLMediaElement) &&
    urn.contentType != null
  ) {
    element.setAttribute("type", urn.contentType);
  }
  return true;
}

function normalizeWorkspaceUrnValue(value: string): string {
  return value.trim().replace(/&amp;/gi, "&");
}

function parseWorkspaceEntityUrn(value: string): WorkspaceEntityUrn | null {
  const original = normalizeWorkspaceUrnValue(value);
  const match = WORKSPACE_ENTITY_URN_RE.exec(original);
  if (match == null) return null;
  const kind = match[1]?.toLowerCase() as WorkspaceEntityUrnKind | undefined;
  const uuid = match[2]?.toLowerCase();
  if (kind == null || uuid == null) return null;
  return { kind, uuid, original };
}

function parseWorkspaceUrlUrn(value: string): string | null {
  const original = normalizeWorkspaceUrnValue(value);
  if (!original.toLowerCase().startsWith(WORKSPACE_URL_URN_PREFIX)) return null;
  const url = original.slice(WORKSPACE_URL_URN_PREFIX.length);
  return HTTP_URL_RE.test(url) ? url : null;
}

function resolveWorkspaceGeneratedAvatarUrn(value: string): string | null {
  const original = normalizeWorkspaceUrnValue(value);
  if (!original.toLowerCase().startsWith(WORKSPACE_GAVATAR_URN_PREFIX)) return null;
  const url = resolveAvatarUrl(original);
  return url ?? null;
}

function buildWorkspaceEntityLinkHref(urn: WorkspaceEntityUrn): string {
  return `#workspace-${urn.kind}-${urn.uuid}`;
}

function buildWorkspaceMentionLabel(link: HTMLAnchorElement): string {
  const label = (link.textContent ?? "").trim();
  if (label.length === 0) return "@unknown";
  return label.startsWith("@") ? label : `@${label}`;
}

function replaceWorkspaceUserUrnLink(link: HTMLAnchorElement, urn: WorkspaceEntityUrn): void {
  const mention = document.createElement("span");
  mention.classList.add("user-mention");
  mention.setAttribute("data-user-uuid", urn.uuid);
  mention.setAttribute("data-workspace-urn", urn.original);
  mention.textContent = buildWorkspaceMentionLabel(link);
  link.replaceWith(mention);
}

function setWorkspaceEntityUrnAttrs(link: HTMLAnchorElement, urn: WorkspaceEntityUrn): void {
  link.setAttribute("href", buildWorkspaceEntityLinkHref(urn));
  link.setAttribute("data-workspace-urn", urn.original);
  link.setAttribute("data-workspace-entity-type", urn.kind);
  link.setAttribute("data-workspace-entity-uuid", urn.uuid);
  if (urn.kind === "message") {
    link.setAttribute("data-workspace-message-uuid", urn.uuid);
  }
  if (urn.kind === "stream") {
    link.setAttribute("data-workspace-stream-uuid", urn.uuid);
  }
  if (urn.kind === "topic") {
    link.setAttribute("data-workspace-topic-uuid", urn.uuid);
  }
}

function rewriteWorkspaceEntityUrnLink(link: HTMLAnchorElement): boolean {
  const urn = parseWorkspaceEntityUrn(link.getAttribute("href") ?? "");
  if (urn == null) return false;
  if (urn.kind === "user") {
    replaceWorkspaceUserUrnLink(link, urn);
    return true;
  }
  setWorkspaceEntityUrnAttrs(link, urn);
  return true;
}

function rewriteWorkspaceGeneratedAvatarUrnLink(link: HTMLAnchorElement): boolean {
  const original = normalizeWorkspaceUrnValue(link.getAttribute("href") ?? "");
  const url = resolveWorkspaceGeneratedAvatarUrn(original);
  if (url == null) return false;
  link.setAttribute("href", url);
  link.setAttribute("data-workspace-urn", original);
  return true;
}

function rewriteWorkspaceUrlUrnLink(link: HTMLAnchorElement): void {
  const url = parseWorkspaceUrlUrn(link.getAttribute("href") ?? "");
  if (url != null) link.setAttribute("href", url);
}

function rewriteWorkspaceGeneratedAvatarUrnMediaElement(element: HTMLElement): boolean {
  if (!(element instanceof HTMLImageElement)) return false;
  const original = normalizeWorkspaceUrnValue(element.getAttribute("src") ?? "");
  const url = resolveWorkspaceGeneratedAvatarUrn(original);
  if (url == null) return false;
  element.setAttribute("src", url);
  element.setAttribute("data-workspace-urn", original);
  return true;
}

function rewriteWorkspaceUrlUrnMediaElement(element: HTMLElement): void {
  const url = parseWorkspaceUrlUrn(element.getAttribute("src") ?? "");
  if (url != null) element.setAttribute("src", url);
}

function rewriteWorkspaceUrnLink(link: HTMLAnchorElement): void {
  if (rewriteWorkspaceFileUrnLink(link)) return;
  if (rewriteWorkspaceEntityUrnLink(link)) return;
  if (rewriteWorkspaceGeneratedAvatarUrnLink(link)) return;
  rewriteWorkspaceUrlUrnLink(link);
}

function rewriteWorkspaceUrnMediaElement(element: HTMLElement): void {
  if (rewriteWorkspaceFileUrnMediaElement(element)) return;
  if (rewriteWorkspaceGeneratedAvatarUrnMediaElement(element)) return;
  rewriteWorkspaceUrlUrnMediaElement(element);
}

function rewriteWorkspaceUrnsInHtml(rawHtml: string): string {
  if (typeof document === "undefined" || !rawHtml.includes("urn:")) {
    return rawHtml;
  }

  const template = document.createElement("template");
  template.innerHTML = rawHtml;

  for (const link of template.content.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    rewriteWorkspaceUrnLink(link);
  }

  for (const element of template.content.querySelectorAll<HTMLElement>("img,source,audio,video")) {
    rewriteWorkspaceUrnMediaElement(element);
  }

  return template.innerHTML;
}

function enrichSanitizedMessageHtml(
  container: ParentNode,
  options?: PrepareProtectedMessageHtmlOptions,
): void {
  applySyntaxHighlightingInContainer(container);
  renderEmojiShortcodesInContainer(container, {
    resolveCustomEmojiShortcodeImageUrl: options?.resolveCustomEmojiShortcodeImageUrl,
  });
  normalizeWorkspaceSpoilerBlocksInContainer(container);
  normalizeWorkspaceQuoteBlocksInContainer(container);
  inlineUserUploadImageLinksInContainer(container);
  upgradeUserUploadVideoLinksInContainer(container);
}

export function protectMessageMediaElementsInContainer(
  container: ParentNode,
  trustedOrigins?: TrustedProtectedMediaOrigins,
): void {
  for (const element of container.querySelectorAll<HTMLElement>("[style]")) {
    protectStyleAttr(element, trustedOrigins);
  }

  for (const picture of container.querySelectorAll("picture")) {
    protectPictureElement(picture, trustedOrigins);
  }

  const mediaWithSrc = container.querySelectorAll<HTMLElement>("img,source,audio,video");
  for (const element of mediaWithSrc) {
    if (element.closest("picture") != null && element.tagName === "SOURCE") {
      continue;
    }

    const protectedSrcsetCandidate = getProtectedSrcsetCandidate(
      element.getAttribute("srcset"),
      trustedOrigins,
    );
    const src = getProtectedSrcCandidate(element, trustedOrigins);
    if (src == null) {
      if (protectedSrcsetCandidate != null) {
        stripInlineStyleAttr(element);
        stripResponsiveMediaAttrs(element);
      }
      continue;
    }

    if (element instanceof HTMLImageElement) {
      prepareProtectedMessageImageElement(element, src, trustedOrigins);
      continue;
    }

    stripInlineStyleAttr(element);
    stripResponsiveMediaAttrs(element);
    if (
      element instanceof HTMLVideoElement ||
      element instanceof HTMLAudioElement ||
      element instanceof HTMLSourceElement
    ) {
      prepareProtectedGenericMediaElement(element, src);
    }
  }

  const videosWithPoster = container.querySelectorAll<HTMLVideoElement>("video[poster]");
  for (const video of videosWithPoster) {
    const poster = video.getAttribute("poster");
    if (!poster || !isProtectedMessageMediaUrl(poster, trustedOrigins)) {
      continue;
    }
    stripInlineStyleAttr(video);
    video.setAttribute(AUTH_MEDIA_POSTER_DATA_ATTR, collapseDuplicateWorkspaceV1InUrl(poster));
    video.removeAttribute("poster");
  }
}

export function prepareProtectedSanitizedHtml(
  html: string,
  options?: PrepareProtectedMessageHtmlOptions,
  additionalTrustedOrigins?: Iterable<string>,
): string {
  if (typeof document === "undefined" || html.trim().length === 0) {
    return html;
  }

  const trustedOrigins = getTrustedProtectedMediaOrigins(additionalTrustedOrigins);
  const template = document.createElement("template");
  template.innerHTML = html;
  const container = template.content;

  enrichSanitizedMessageHtml(container, options);
  protectMessageMediaElementsInContainer(container, trustedOrigins);

  return template.innerHTML;
}

export function prepareProtectedMessageHtml(
  rawHtml: string,
  baseUrl?: string,
  options?: PrepareProtectedMessageHtmlOptions,
): string {
  const html = sanitizeHtml(rewriteWorkspaceUrnsInHtml(rawHtml), baseUrl);
  const baseOrigin = getUrlOrigin(baseUrl);
  return prepareProtectedSanitizedHtml(
    html,
    options,
    baseOrigin != null ? [baseOrigin] : undefined,
  );
}
