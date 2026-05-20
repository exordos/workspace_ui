/**
 * Preserves client-side link previews when Zulip message rows are merged/replaced.
 */
import type { MockMessage } from "~/shared/api/zulip.types";
import { linkPreviewsFromMessage } from "~/shared/lib/message-link-preview-list.lib";
import { traceLinkPreview } from "~/shared/lib/message-link-preview-trace.lib";
import { linkPreviewUrlKey } from "~/shared/lib/message-link-preview-url-match.lib";

/** Keeps `link_previews` from `existing` when the incoming row omits them. */
export function mergeMessagePreservingLinkPreview(
  incoming: MockMessage,
  existing?: MockMessage,
): MockMessage {
  const existingList = existing != null ? linkPreviewsFromMessage(existing) : [];
  const incomingList = linkPreviewsFromMessage(incoming);

  if (existingList.length === 0) {
    return incoming;
  }
  if (incomingList.length === 0) {
    traceLinkPreview("merge:preserve-link-preview", {
      messageId: incoming.id,
      count: existingList.length,
    });
    const { link_preview: _legacy, ...rest } = incoming;
    return { ...rest, link_previews: existingList };
  }

  const byUrl = new Map<string, (typeof existingList)[number]>();
  for (const preview of existingList) {
    byUrl.set(linkPreviewUrlKey(preview.targetUrl), preview);
  }
  for (const preview of incomingList) {
    byUrl.set(linkPreviewUrlKey(preview.targetUrl), preview);
  }

  traceLinkPreview("merge:incoming-has-link-preview", {
    messageId: incoming.id,
    incomingCount: incomingList.length,
    mergedCount: byUrl.size,
  });

  const { link_preview: _legacy, ...rest } = incoming;
  return { ...rest, link_previews: Array.from(byUrl.values()) };
}
