/**
 * Fetches link preview metadata from Zulip-rendered HTML (`.message_embed`).
 *
 * Persisted messages: GET `/messages/{id}?apply_markdown=true` (includes server unfurl).
 * Ephemeral content: POST `/messages/render` (composer-style, often without embed).
 *
 * Usage:
 *   import {
 *     fetchLinkPreviewsFromMessageMarkdown,
 *     parseAllMessageEmbedsFromRenderedHtml,
 *   } from "~/shared/lib/message-link-preview-fetch.lib";
 */
import { fetchMessageRenderedHtmlById, renderMessageContent } from "~/shared/api/zulip-messages";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import { traceLinkPreview } from "~/shared/lib/message-link-preview-trace.lib";
import {
  findLinkPreviewDataForUrl,
  linkPreviewUrlKey,
} from "~/shared/lib/message-link-preview-url-match.lib";
import { extractLinkPreviewUrls } from "~/shared/lib/message-link-preview-urls.lib";
import type {
  LinkPreviewData,
  LinkPreviewResolvedItem,
} from "~/shared/lib/message-link-preview.types";

const log = createLogger("link-preview");

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

  const template = document.createElement("template");
  template.innerHTML = trimmed;
  const embeds = template.content.querySelectorAll(".message_embed");
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

function resolveItemsFromHtml(
  html: string,
  expectedUrls: string[],
  source: "get-message" | "render",
): LinkPreviewResolvedItem[] {
  const embeds = parseAllMessageEmbedsFromRenderedHtml(html);

  return expectedUrls.map((url) => {
    const data = findLinkPreviewDataForUrl(url, embeds);
    if (data == null) {
      traceLinkPreview("fetch:no-embed", {
        expectedUrl: url,
        renderedLen: html.length,
        source,
      });
    } else {
      traceLinkPreview("fetch:ok", {
        expectedUrl: url,
        title: data.title,
        source,
      });
    }
    return { targetUrl: url, data };
  });
}

/**
 * Loads link preview metadata for all previewable URLs in markdown.
 */
export async function fetchLinkPreviewsFromMessageMarkdown(
  markdown: string,
  messageId: number,
  signal?: AbortSignal,
): Promise<LinkPreviewResolvedItem[]> {
  const body = markdown.trim();
  if (body.length === 0) {
    return [];
  }
  const expectedUrls = extractLinkPreviewUrls(body);
  if (expectedUrls.length === 0) {
    return [];
  }
  try {
    if (signal?.aborted) {
      return expectedUrls.map((targetUrl) => ({ targetUrl, data: null }));
    }
    if (messageId > 0) {
      const html = await fetchMessageRenderedHtmlById(messageId, signal);
      if (signal?.aborted) {
        return expectedUrls.map((targetUrl) => ({ targetUrl, data: null }));
      }
      if (html == null) {
        return expectedUrls.map((targetUrl) => ({ targetUrl, data: null }));
      }
      return resolveItemsFromHtml(html, expectedUrls, "get-message");
    }
    const rendered = await renderMessageContent(body);
    if (signal?.aborted) {
      return expectedUrls.map((targetUrl) => ({ targetUrl, data: null }));
    }
    return resolveItemsFromHtml(rendered, expectedUrls, "render");
  } catch (error) {
    if (signal?.aborted) {
      return expectedUrls.map((targetUrl) => ({ targetUrl, data: null }));
    }
    log.warn("Link preview fetch failed", {
      error: error instanceof Error ? error.message : "unknown",
      messageId,
    });
    traceLinkPreview("fetch:error", {
      error: error instanceof Error ? error.message : "unknown",
      messageId,
    });
    return expectedUrls.map((targetUrl) => ({ targetUrl, data: null }));
  }
}
