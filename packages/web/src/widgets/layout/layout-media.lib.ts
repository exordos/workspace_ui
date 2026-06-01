import type { MockMessage } from "~/shared/api/zulip.types";
import { isVideoFileHref } from "~/shared/lib/user-upload-media-path.lib";

const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|svg|bmp|avif)(?:[?#]|$)/i;
const FILE_EXT_RE = /\.(?:pdf|docx?|xlsx?|pptx?|zip|rar|7z|txt|csv|rtf|odt|ods|odp)(?:[?#]|$)/i;
const HREF_RE = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;

export interface RightPanelMediaStats {
  photos: number;
  videos: number;
  files: number;
  links: number;
}

/**
 * Derives media counters for the DM right panel from rendered message content.
 * We count explicit media tags and classify anchor hrefs by file extension.
 */
export function buildRightPanelMedia(messages: MockMessage[]): RightPanelMediaStats | undefined {
  let photos = 0;
  let videos = 0;
  let files = 0;
  let links = 0;

  for (const message of messages) {
    const content = message.content;

    photos += content.match(/<img\b/gi)?.length ?? 0;
    videos += content.match(/<video\b/gi)?.length ?? 0;

    const hrefMatches = Array.from(content.matchAll(HREF_RE));
    links += hrefMatches.length;

    for (const match of hrefMatches) {
      const href = match[1] ?? "";
      if (IMAGE_EXT_RE.test(href)) {
        photos += 1;
      } else if (isVideoFileHref(href)) {
        videos += 1;
      } else if (FILE_EXT_RE.test(href)) {
        files += 1;
      }
    }
  }

  if (photos === 0 && videos === 0 && files === 0 && links === 0) {
    return undefined;
  }

  return { photos, videos, files, links };
}
