/**
 * Canonical URL keys for matching message text URLs to Zulip embed targets.
 */
import type { LinkPreviewData } from "~/shared/lib/message-link-preview.types";

/** Max link preview cards per message (abuse / layout protection). */
export const MAX_LINK_PREVIEWS_PER_MESSAGE = 10;

/** Stable comparison key (host, path, query; no hash; no trailing slash). */
export function linkPreviewUrlKey(url: string): string {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return "";
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return trimmed;
    }
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith("www.")) {
      host = host.slice(4);
    }
    let path = parsed.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    const port =
      parsed.port.length > 0 &&
      !(
        (parsed.protocol === "https:" && parsed.port === "443") ||
        (parsed.protocol === "http:" && parsed.port === "80")
      )
        ? `:${parsed.port}`
        : "";
    return `${parsed.protocol}//${host}${port}${path}${parsed.search}`;
  } catch {
    return trimmed;
  }
}

export function linkPreviewUrlsMatch(a: string, b: string): boolean {
  return linkPreviewUrlKey(a) === linkPreviewUrlKey(b);
}

/** Finds embed whose target matches `expectedUrl` (canonical or exact trim). */
export function findLinkPreviewDataForUrl(
  expectedUrl: string,
  embeds: readonly LinkPreviewData[],
): LinkPreviewData | null {
  const key = linkPreviewUrlKey(expectedUrl);
  if (key.length === 0) {
    return null;
  }
  for (const embed of embeds) {
    if (linkPreviewUrlKey(embed.targetUrl) === key) {
      return embed;
    }
  }
  const trimmed = expectedUrl.trim();
  for (const embed of embeds) {
    if (embed.targetUrl.trim() === trimmed) {
      return embed;
    }
  }
  return null;
}
