/**
 * Buffers link previews from `rendering_only` events that arrive before the message row exists.
 */
import type { MockMessage } from "~/shared/api/zulip.types";
import { upsertLinkPreviewOnMessage } from "~/shared/lib/message-link-preview-list.lib";
import { linkPreviewUrlKey } from "~/shared/lib/message-link-preview-url-match.lib";
import { extractLinkPreviewUrls } from "~/shared/lib/message-link-preview-urls.lib";
import type { LinkPreviewData } from "~/shared/lib/message-link-preview.types";

const pendingByMessageId = new Map<number, LinkPreviewData[]>();

export function enqueuePendingLinkPreview(messageId: number, preview: LinkPreviewData): void {
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return;
  }
  const key = linkPreviewUrlKey(preview.targetUrl);
  const list = pendingByMessageId.get(messageId) ?? [];
  if (!list.some((item) => linkPreviewUrlKey(item.targetUrl) === key)) {
    list.push(preview);
  }
  pendingByMessageId.set(messageId, list);
}

export function drainPendingLinkPreviews(messageId: number): LinkPreviewData[] {
  const list = pendingByMessageId.get(messageId) ?? [];
  pendingByMessageId.delete(messageId);
  return list;
}

/** Clears buffer without applying (tests). */
export function clearPendingLinkPreviewsForTests(): void {
  pendingByMessageId.clear();
}

function isPreviewUrlExpectedInMarkdown(markdown: string, preview: LinkPreviewData): boolean {
  const keys = new Set(extractLinkPreviewUrls(markdown).map((url) => linkPreviewUrlKey(url)));
  return keys.has(linkPreviewUrlKey(preview.targetUrl));
}

/** Applies buffered previews when a persisted message row appears or updates. */
export function applyPendingLinkPreviewsToMessage(message: MockMessage): MockMessage {
  if (message.id <= 0) {
    return message;
  }
  const pending = drainPendingLinkPreviews(message.id);
  if (pending.length === 0) {
    return message;
  }
  const markdown = message.markdown_source ?? message.content;
  let result = message;
  for (const preview of pending) {
    if (isPreviewUrlExpectedInMarkdown(markdown, preview)) {
      result = upsertLinkPreviewOnMessage(result, preview);
    }
  }
  return result;
}
