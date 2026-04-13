import type { MediaItem } from "~/features/media-viewer/media-viewer.types";
import type { MockMessage } from "~/shared/api/zulip.types";
import { isUserUploadImageHref } from "./message-bubble-user-upload-links.lib";

const IMG_SRC_REGEX = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
const A_HREF_REGEX = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

export interface MessageMediaGallery {
  items: MediaItem[];
  indexByUrl: Map<string, number>;
}

export function normalizeMediaUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed === "") return "";
  if (trimmed.startsWith("blob:")) return trimmed;

  try {
    return new URL(trimmed, window.location.origin).href;
  } catch {
    return trimmed;
  }
}

function extractImageUrls(content: string): string[] {
  const urls: string[] = [];
  IMG_SRC_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = IMG_SRC_REGEX.exec(content)) !== null) {
    const raw = match[1] ?? match[2] ?? match[3] ?? "";
    const normalized = normalizeMediaUrl(raw);
    if (normalized !== "") {
      urls.push(normalized);
    }
  }

  return urls;
}

function extractUserUploadImageLinkUrls(content: string): string[] {
  const urls: string[] = [];
  A_HREF_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = A_HREF_REGEX.exec(content)) !== null) {
    const raw = match[1] ?? match[2] ?? match[3] ?? "";
    if (!isUserUploadImageHref(raw)) continue;
    const normalized = normalizeMediaUrl(raw);
    if (normalized !== "") {
      urls.push(normalized);
    }
  }

  return urls;
}

export function buildMessageMediaGallery(messages: MockMessage[]): MessageMediaGallery {
  const items: MediaItem[] = [];
  const indexByUrl = new Map<string, number>();

  for (const message of messages) {
    const urls = [
      ...extractImageUrls(message.content),
      ...extractUserUploadImageLinkUrls(message.content),
    ];
    for (const url of urls) {
      if (indexByUrl.has(url)) continue;
      indexByUrl.set(url, items.length);
      items.push({ url, type: "image" });
    }
  }

  return { items, indexByUrl };
}
