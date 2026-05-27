/**
 * Filters stored link previews when message body changes.
 */
import type { MockMessage } from "~/shared/api/zulip.types";
import { linkPreviewsFromMessage } from "~/shared/lib/message-link-preview-list.lib";
import { linkPreviewUrlKey } from "~/shared/lib/message-link-preview-url-match.lib";
import { extractLinkPreviewUrls } from "~/shared/lib/message-link-preview-urls.lib";

/** Drops previews whose URL is no longer present in the message markdown. */
export function filterMessageLinkPreviewsForMarkdown(
  message: MockMessage,
  markdownBody: string,
): MockMessage {
  const allowed = new Set(
    extractLinkPreviewUrls(markdownBody).map((url) => linkPreviewUrlKey(url)),
  );
  const existing = linkPreviewsFromMessage(message);
  if (existing.length === 0) {
    return message;
  }
  const filtered = existing.filter((preview) => allowed.has(linkPreviewUrlKey(preview.targetUrl)));
  if (filtered.length === existing.length) {
    return message;
  }
  const rest = { ...message };
  delete rest.link_preview;
  delete rest.link_previews;
  if (filtered.length === 0) {
    return rest;
  }
  return { ...rest, link_previews: filtered };
}
