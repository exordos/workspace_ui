/**
 * Authorized fetch helpers for Zulip protected message media.
 *
 * Live DOM must not keep protected URLs in `src`/`poster`/etc.; candidates live in `data-auth-*`
 * until `fetch → blob/data:` assigns display URLs.
 */
import hljs from "highlight.js/lib/common";
import { appendDevRealmMediaProxyHeaders, getCurrentInstance } from "~/shared/api/client";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import {
  appendUserUploadsPathPrefix,
  normalizeRealmSiteOriginForUploads,
  shouldApplyUserUploadsPathPrefixForRealmBase,
} from "~/shared/api/zulip-realm.internal";
import { env } from "~/shared/lib/env";
import { sanitizeHtml } from "~/shared/lib/html";
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
import {
  collapseDuplicateWorkspaceV1InUrl,
  extractProtectedMessageMediaPathAndQuery,
  isExternalContentPath,
  isProtectedMessageMediaPath,
  isUserUploadsPath,
} from "~/shared/lib/user-uploads-url.lib";

export { collapseDuplicateWorkspaceV1InUrl };

export const AUTH_MEDIA_SRC_DATA_ATTR = "data-auth-src";
export const AUTH_MEDIA_POSTER_DATA_ATTR = "data-auth-poster";
export const AUTH_MEDIA_BACKGROUND_IMAGE_DATA_ATTR = "data-auth-background-image";

export interface PrepareProtectedMessageHtmlOptions {
  resolveCustomEmojiShortcodeImageUrl?: (shortcode: string) => string | undefined;
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
const DEFAULT_ZULIP_SPOILER_HEADER = "Spoiler";

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

export function isProtectedUserUploadUrl(url: string): boolean {
  const value = url.trim();
  if (value.length === 0) return false;
  if (isUserUploadsPath(value)) return true;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://localhost";
    return isUserUploadsPath(new URL(value, base).pathname);
  } catch {
    return false;
  }
}

export function isProtectedMessageMediaUrl(url: string): boolean {
  const value = url.trim();
  if (value.length === 0) return false;
  if (isProtectedMessageMediaPath(value)) return true;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://localhost";
    return isProtectedMessageMediaPath(new URL(value, base).pathname);
  } catch {
    return false;
  }
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

function getProtectedSrcsetCandidate(srcset: string | null): string | null {
  if (srcset == null || srcset.trim() === "") return null;
  const candidates = parseSrcsetCandidates(srcset);
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (candidate != null && isProtectedMessageMediaUrl(candidate)) {
      return collapseDuplicateWorkspaceV1InUrl(candidate);
    }
  }
  return null;
}

function getProtectedSrcCandidate(element: Element): string | null {
  const src = element.getAttribute("src");
  if (src != null && src.trim() !== "") {
    if (isProtectedMessageMediaUrl(src)) {
      return collapseDuplicateWorkspaceV1InUrl(src);
    }
    return null;
  }
  return getProtectedSrcsetCandidate(element.getAttribute("srcset"));
}

function getProtectedBackgroundImageCandidate(styleValue: string | null): string | null {
  if (styleValue == null || styleValue.trim() === "") return null;
  const match = /background-image\s*:\s*url\(\s*(?:"([^"]+)"|'([^']+)'|([^)"']+))\s*\)/i.exec(
    styleValue,
  );
  const candidate = match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
  if (candidate === "" || !isProtectedMessageMediaUrl(candidate)) {
    return null;
  }
  return collapseDuplicateWorkspaceV1InUrl(candidate);
}

function stripInlineStyleAttr(element: Element): void {
  element.removeAttribute("style");
}

function hasProtectedMessageMediaInStyle(styleValue: string | null): boolean {
  if (styleValue == null || styleValue.trim() === "") return false;
  return styleValue.includes("/user_uploads/") || styleValue.includes("/external_content/");
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

function prepareProtectedMessageImageElement(img: HTMLImageElement, srcAttrValue: string): void {
  if (isProtectedUserUploadUrl(srcAttrValue)) {
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

function protectPictureElement(picture: HTMLPictureElement): void {
  const image = picture.querySelector("img");
  const imageSrc = image?.getAttribute("src")?.trim() ?? "";
  const imageHasPublicSrc = imageSrc !== "" && !isProtectedMessageMediaUrl(imageSrc);
  const imageCandidate = image != null ? getProtectedSrcCandidate(image) : null;
  const sourceCandidates = Array.from(picture.querySelectorAll("source"))
    .map((source) => getProtectedSrcCandidate(source))
    .filter((candidate): candidate is string => candidate != null);

  for (const source of picture.querySelectorAll("source")) {
    stripInlineStyleAttr(source);
    stripResponsiveMediaAttrs(source);
    source.removeAttribute("src");
  }

  if (image == null) return;
  if (imageHasPublicSrc) {
    stripInlineStyleAttr(image);
    if (getProtectedSrcsetCandidate(image.getAttribute("srcset")) != null) {
      stripResponsiveMediaAttrs(image);
    }
    return;
  }
  const chosenCandidate = imageCandidate ?? sourceCandidates[sourceCandidates.length - 1] ?? null;
  if (chosenCandidate == null) {
    stripInlineStyleAttr(image);
    return;
  }
  prepareProtectedMessageImageElement(image, chosenCandidate);
}

function protectEmbedBackgroundImageElement(element: HTMLElement): void {
  const candidate = getProtectedBackgroundImageCandidate(element.getAttribute("style"));
  if (candidate == null) {
    return;
  }

  stripInlineStyleAttr(element);
  element.setAttribute(AUTH_MEDIA_BACKGROUND_IMAGE_DATA_ATTR, candidate);
}

function protectStyleAttr(element: HTMLElement): void {
  const styleValue = element.getAttribute("style");
  if (!hasProtectedMessageMediaInStyle(styleValue)) {
    return;
  }
  if (element.classList.contains("message_embed_image")) {
    protectEmbedBackgroundImageElement(element);
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

/** Cross-origin protected media: cookies for OIDC session; Basic auth header for API key. */
function resolveCrossOriginProtectedUploadCredentials(
  headers: Record<string, string>,
): RequestCredentials {
  if (getCurrentInstance()?.authType === "session") {
    return "include";
  }
  const authorization = headers.Authorization?.trim() ?? "";
  if (authorization.length === 0) {
    return "include";
  }
  return "omit";
}

export function resolveProtectedUploadFetchOptions(
  candidate: string,
  headers: Record<string, string>,
): RequestInit {
  const withDevUploadProxy = appendDevRealmMediaProxyHeaders(candidate, headers);
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://localhost";
    const parsed = new URL(candidate, base);
    const isCrossOrigin = typeof window !== "undefined" && parsed.origin !== window.location.origin;
    if (isCrossOrigin) {
      return {
        headers: withDevUploadProxy,
        credentials: resolveCrossOriginProtectedUploadCredentials(headers),
      };
    }
  } catch {
    // Fall back to same-origin defaults when URL parsing fails.
  }
  return { headers: withDevUploadProxy, credentials: "include" };
}

export async function fetchProtectedUploadBlob(
  rawValue: string,
  headers: Record<string, string>,
): Promise<Blob | null> {
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

function normalizeZulipSpoilerBlocksInContainer(container: ParentNode): void {
  const spoilerBlocks = container.querySelectorAll<HTMLElement>(".spoiler-block");
  for (const block of spoilerBlocks) {
    const header = block.querySelector<HTMLElement>(".spoiler-header");
    const content = block.querySelector<HTMLElement>(".spoiler-content");
    if (content == null) continue;

    if (header == null) {
      const fallbackHeader = document.createElement("div");
      fallbackHeader.classList.add("spoiler-header");
      fallbackHeader.textContent = DEFAULT_ZULIP_SPOILER_HEADER;
      block.insertBefore(fallbackHeader, content);
      continue;
    }

    if ((header.textContent ?? "").trim().length === 0) {
      header.textContent = DEFAULT_ZULIP_SPOILER_HEADER;
    }
  }
}

function normalizeZulipQuoteBlocksInContainer(container: ParentNode): void {
  const blockquotes = container.querySelectorAll<HTMLElement>("blockquote");
  for (const blockquote of blockquotes) {
    if (blockquote.classList.contains("zulip-quote-body")) continue;
    if (blockquote.closest(".zulip-quote-block") != null) continue;

    const previous = blockquote.previousElementSibling;
    if (previous == null) continue;

    const hasMention = previous.querySelector(".user-mention") != null;
    const wroteLink = previous.querySelector("a[href]");
    if (!hasMention && wroteLink == null) continue;

    const quoteBlock = document.createElement("div");
    quoteBlock.className = "zulip-quote-block";

    const header = document.createElement("div");
    header.className = "zulip-quote-header";
    header.innerHTML = previous.innerHTML;

    blockquote.classList.add("zulip-quote-body");
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
  for (const quoteBlock of container.querySelectorAll<HTMLElement>(".zulip-quote-block")) {
    const quoteBody = quoteBlock.querySelector(".zulip-quote-body");
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
    if (!isUserUploadImagePath(href)) continue;
    if (link.querySelector("img") != null) continue;
    const inQuoteBody = link.closest(".zulip-quote-body") != null;
    if (!inQuoteBody && shouldSkipInliningUserUploadImageLink(href, inlineIdentities)) continue;

    const title = (link.textContent ?? "").trim();
    const fallbackLabel = title.length > 0 ? title : "image";
    const image = document.createElement("img");
    // Use an auth placeholder immediately so later DOM insertion cannot trigger unauthenticated loads.
    prepareProtectedUserUploadImageElement(image, href);
    image.setAttribute("alt", fallbackLabel);
    image.setAttribute("title", fallbackLabel);
    link.replaceChildren(image);
  }

  removeDuplicateQuoteBlockInlineImages(container);
}

function enrichSanitizedMessageHtml(
  container: ParentNode,
  options?: PrepareProtectedMessageHtmlOptions,
): void {
  applySyntaxHighlightingInContainer(container);
  renderEmojiShortcodesInContainer(container, {
    resolveCustomEmojiShortcodeImageUrl: options?.resolveCustomEmojiShortcodeImageUrl,
  });
  normalizeZulipSpoilerBlocksInContainer(container);
  normalizeZulipQuoteBlocksInContainer(container);
  inlineUserUploadImageLinksInContainer(container);
  upgradeUserUploadVideoLinksInContainer(container);
}

export function protectMessageMediaElementsInContainer(container: ParentNode): void {
  for (const element of container.querySelectorAll<HTMLElement>("[style]")) {
    protectStyleAttr(element);
  }

  for (const picture of container.querySelectorAll("picture")) {
    protectPictureElement(picture);
  }

  const mediaWithSrc = container.querySelectorAll<HTMLElement>("img,source,audio,video");
  for (const element of mediaWithSrc) {
    if (element.closest("picture") != null && element.tagName === "SOURCE") {
      continue;
    }

    const protectedSrcsetCandidate = getProtectedSrcsetCandidate(element.getAttribute("srcset"));
    const src = getProtectedSrcCandidate(element);
    if (src == null) {
      if (protectedSrcsetCandidate != null) {
        stripInlineStyleAttr(element);
        stripResponsiveMediaAttrs(element);
      }
      continue;
    }

    if (element instanceof HTMLImageElement) {
      prepareProtectedMessageImageElement(element, src);
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
    if (!poster || !isProtectedMessageMediaUrl(poster)) {
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
): string {
  if (typeof document === "undefined" || html.trim().length === 0) {
    return html;
  }

  const template = document.createElement("template");
  template.innerHTML = html;
  const container = template.content;

  enrichSanitizedMessageHtml(container, options);
  protectMessageMediaElementsInContainer(container);

  return template.innerHTML;
}

export function prepareProtectedMessageHtml(
  rawHtml: string,
  baseUrl?: string,
  options?: PrepareProtectedMessageHtmlOptions,
): string {
  const html = sanitizeHtml(rawHtml, baseUrl);
  return prepareProtectedSanitizedHtml(html, options);
}
