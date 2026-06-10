import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import type { ZulipEvent } from "~/shared/api/zulip.types";
import { parseAllMessageEmbedsFromRenderedHtml } from "~/shared/lib/message-link-preview-fetch.lib";
import { enqueuePendingLinkPreview } from "~/shared/lib/message-link-preview-pending.lib";
import { linkPreviewUrlsMatch } from "~/shared/lib/message-link-preview-url-match.lib";
import { extractLinkPreviewUrls } from "~/shared/lib/message-link-preview-urls.lib";
import { extractStreamMoveFromUpdateEvent } from "~/shared/lib/update-message-stream-move.lib";
import { extractTopicMoveFromUpdateEvent } from "~/shared/lib/update-message-topic-move.lib";
import type { LayoutZulipEventDispatchContext } from "./layout-zulip-event-dispatch.types";

export function applyUpdateMessageContent(
  event: ZulipEvent,
  ctx: LayoutZulipEventDispatchContext,
): void {
  const messageId = event.message_id as number | undefined;
  const renderingOnly = event.rendering_only === true;
  const newMarkdown =
    !renderingOnly && typeof event.content === "string" ? event.content : undefined;
  if (messageId == null || newMarkdown == null) return;

  const trimmed = newMarkdown.trim();
  ctx.currentChat.updateMessageContent(
    messageId,
    newMarkdown,
    trimmed.length > 0 ? newMarkdown : undefined,
  );
}

export function applyRenderingOnlyLinkPreviews(
  event: ZulipEvent,
  ctx: LayoutZulipEventDispatchContext,
): void {
  if (event.rendering_only !== true) return;
  if (typeof event.rendered_content !== "string") return;

  const messageId = event.message_id as number | undefined;
  if (messageId == null) return;

  const embeds = parseAllMessageEmbedsFromRenderedHtml(event.rendered_content);
  if (embeds.length === 0) return;

  const row = useCurrentChatMessagesStore.getState().messages.find((m) => m.id === messageId);
  if (row == null) {
    for (const preview of embeds) {
      enqueuePendingLinkPreview(messageId, preview);
    }
    return;
  }

  const markdownBody = row.markdown_source ?? row.content;
  const expectedUrls = extractLinkPreviewUrls(markdownBody);
  for (const preview of embeds) {
    const matchesExpected = expectedUrls.some((url) =>
      linkPreviewUrlsMatch(url, preview.targetUrl),
    );
    if (matchesExpected) {
      ctx.currentChat.updateMessageLinkPreview(messageId, preview);
    }
  }
}

export function applyTopicMoveFromUpdateMessage(
  event: ZulipEvent,
  ctx: LayoutZulipEventDispatchContext,
): void {
  const streamMovePayload = extractStreamMoveFromUpdateEvent(event);
  if (streamMovePayload != null) {
    const targetStreamName =
      ctx.chatList.streamsMap.get(streamMovePayload.targetStreamId)?.name ?? "";
    ctx.chatList.moveTopicToStream(streamMovePayload);
    ctx.currentChat.moveTopicToStreamMessages({
      ...streamMovePayload,
      targetStreamName,
    });
    return;
  }

  const topicMovePayload = extractTopicMoveFromUpdateEvent(event);
  if (topicMovePayload == null) return;
  ctx.chatList.moveStreamTopic(topicMovePayload);
  ctx.currentChat.moveStreamTopicMessages(topicMovePayload);
}
