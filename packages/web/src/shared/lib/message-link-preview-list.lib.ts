/**
 * Helpers for multiple link previews per message.
 */
import type { MockMessage } from "~/shared/api/zulip.types";
import { linkPreviewUrlKey } from "~/shared/lib/message-link-preview-url-match.lib";
import type { LinkPreviewData } from "~/shared/lib/message-link-preview.types";

/** Merges `link_previews` and legacy single `link_preview` into one list (deduped by URL). */
export function linkPreviewsFromMessage(message: {
  link_preview?: LinkPreviewData;
  link_previews?: LinkPreviewData[];
}): LinkPreviewData[] {
  const fromArray = message.link_previews ?? [];
  const legacy = message.link_preview;
  const result: LinkPreviewData[] = [];
  const seen = new Set<string>();
  const add = (item: LinkPreviewData) => {
    const key = linkPreviewUrlKey(item.targetUrl);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  };
  if (legacy != null) {
    add(legacy);
  }
  for (const item of fromArray) {
    add(item);
  }
  return result;
}

/** Upserts one preview into a message row (by `targetUrl`). */
export function upsertLinkPreviewOnMessage(
  message: MockMessage,
  preview: LinkPreviewData,
): MockMessage {
  const existing = linkPreviewsFromMessage(message);
  const key = linkPreviewUrlKey(preview.targetUrl);
  const next = existing.filter((p) => linkPreviewUrlKey(p.targetUrl) !== key);
  next.push(preview);
  const { link_preview: _removed, ...rest } = message;
  return { ...rest, link_previews: next };
}
