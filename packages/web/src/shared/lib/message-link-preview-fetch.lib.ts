/**
 * Parses link preview metadata from already-rendered HTML (`.message_embed`).
 *
 * Workspace preview fetching is local-only until a native preview contract exists.
 *
 * Usage:
 *   import {
 *     fetchLinkPreviewsFromMessageMarkdown,
 *     parseAllMessageEmbedsFromRenderedHtml,
 *   } from "~/shared/lib/message-link-preview-fetch.lib";
 */
import { guard } from "~/shared/lib/guards";
import { sanitizeHtmlToFragment } from "~/shared/lib/html";
import { traceLinkPreview } from "~/shared/lib/message-link-preview-trace.lib";
import { linkPreviewUrlKey } from "~/shared/lib/message-link-preview-url-match.lib";
import { extractLinkPreviewUrls } from "~/shared/lib/message-link-preview-urls.lib";
import type {
  LinkPreviewData,
  LinkPreviewResolvedItem,
} from "~/shared/lib/message-link-preview.types";

const BACKGROUND_IMAGE_URL_PATTERN = /background-image:\s*url\(["']?([^"')]+)["']?\)/i;

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function extractThumbnailPath(embedRoot: Element): string | undefined {
  const imageLink = embedRoot.querySelector<HTMLAnchorElement>("a.message_embed_image");
  if (imageLink != null) {
    const style = imageLink.getAttribute("style") ?? "";
    const match = BACKGROUND_IMAGE_URL_PATTERN.exec(style);
    if (match?.[1] != null) {
      const decoded = decodeHtmlAttribute(match[1]);
      if (decoded.startsWith("/external_content/")) {
        return decoded;
      }
    }
  }

  const img = embedRoot.querySelector<HTMLImageElement>("img[src]");
  const src = img?.getAttribute("src")?.trim();
  if (src != null && src.startsWith("/external_content/")) {
    return src;
  }

  return undefined;
}

function parseEmbedElement(embed: Element): LinkPreviewData | null {
  const imageLink = embed.querySelector<HTMLAnchorElement>("a.message_embed_image");
  const titleAnchor = embed.querySelector<HTMLAnchorElement>(".message_embed_title a");
  const titleElement = embed.querySelector(".message_embed_title");
  const descriptionElement = embed.querySelector(".message_embed_description");

  const targetUrlRaw =
    imageLink?.getAttribute("href")?.trim() ?? titleAnchor?.getAttribute("href")?.trim() ?? "";
  if (targetUrlRaw.length === 0) {
    return null;
  }

  guard.url(targetUrlRaw, "link preview target");

  const titleText =
    (titleAnchor?.textContent ?? titleElement?.textContent ?? "").trim() || undefined;
  const description = (descriptionElement?.textContent ?? "").trim() || undefined;
  const thumbnailPath = extractThumbnailPath(embed);

  return {
    targetUrl: targetUrlRaw,
    title: titleText,
    description,
    thumbnailPath,
  };
}

/** Parses every `.message_embed` block in Zulip-rendered HTML (deduped by target URL). */
export function parseAllMessageEmbedsFromRenderedHtml(html: string): LinkPreviewData[] {
  const trimmed = html.trim();
  if (trimmed.length === 0 || typeof document === "undefined") {
    return [];
  }

  const fragment = sanitizeHtmlToFragment(trimmed);
  if (fragment == null) {
    return [];
  }
  const embeds = fragment.querySelectorAll(".message_embed");
  const result: LinkPreviewData[] = [];
  const seen = new Set<string>();
  for (const embed of embeds) {
    const parsed = parseEmbedElement(embed);
    if (parsed == null) continue;
    const key = linkPreviewUrlKey(parsed.targetUrl);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(parsed);
  }
  return result;
}

/**
 * Returns empty local preview rows for all previewable URLs in markdown.
 */
export function fetchLinkPreviewsFromMessageMarkdown(
  markdown: string,
  messageId: number,
  signal?: AbortSignal,
): Promise<LinkPreviewResolvedItem[]> {
  const body = markdown.trim();
  if (body.length === 0) {
    return Promise.resolve([]);
  }
  const expectedUrls = extractLinkPreviewUrls(body);
  if (expectedUrls.length === 0) {
    return Promise.resolve([]);
  }
  if (signal?.aborted) {
    return Promise.resolve(expectedUrls.map((targetUrl) => ({ targetUrl, data: null })));
  }

  traceLinkPreview("fetch:unsupported", {
    messageId,
    urlCount: expectedUrls.length,
  });
  return Promise.resolve(expectedUrls.map((targetUrl) => ({ targetUrl, data: null })));
}
