import type { MockMessage } from "~/shared/api/zulip.types";
import { plainTextPreviewFromMessageBody } from "~/shared/lib/message-markdown-display.lib";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { buildZulipQuoteHeader } from "~/shared/lib/zulip-quote-header.lib";
import { buildZulipMessageWebPermalink } from "~/shared/lib/zulip-web-permalink.lib";
import { slugForStream } from "~/widgets/sidebar/sidebar.lib";

export type ForwardableMessage = Pick<
  MockMessage,
  | "id"
  | "sender_full_name"
  | "sender_id"
  | "content"
  | "stream_id"
  | "subject"
  | "display_recipient"
  | "channel"
>;

interface ForwardTargetStream {
  stream_id: number;
  name: string;
}

interface ForwardDraftTarget {
  route: string;
  draftType: "stream" | "private";
  draftTo: number[];
  draftTopic: string;
}

const pendingForwardPrefills = new Map<string, string>();

interface ForwardQuotePermalinkOptions {
  realmBaseUrl: string;
  wroteLabel: string;
  resolveStreamName: (streamId: number, message: ForwardableMessage) => string | undefined;
}

function buildSingleForwardQuote(
  message: ForwardableMessage,
  content: string,
  permalinkOptions?: ForwardQuotePermalinkOptions,
): string {
  const permalinkUrl =
    permalinkOptions != null && permalinkOptions.realmBaseUrl.trim().length > 0
      ? buildZulipMessageWebPermalink(permalinkOptions.realmBaseUrl, message, (streamId) =>
          permalinkOptions.resolveStreamName(streamId, message),
        )
      : null;
  const header = buildZulipQuoteHeader({
    senderName: message.sender_full_name,
    senderId: message.sender_id,
    wroteLabel: permalinkOptions?.wroteLabel ?? "wrote",
    permalinkUrl,
  });
  return `${header}\n\`\`\`quote\n${content}\n\`\`\``;
}

function normalizeForwardPayloadContent(content: string): string {
  return plainTextPreviewFromMessageBody(content).trim();
}

export function buildForwardQuote(
  messages: ForwardableMessage[],
  selectedTextQuote?: string,
  permalinkOptions?: ForwardQuotePermalinkOptions,
): string {
  if (messages.length === 0) return "";
  const normalizedQuote = selectedTextQuote?.trim();
  const singleMessageQuote =
    normalizedQuote && normalizedQuote.length > 0 ? normalizedQuote : undefined;

  return messages
    .map((message, index) =>
      buildSingleForwardQuote(
        message,
        messages.length === 1 && index === 0 && singleMessageQuote != null
          ? singleMessageQuote
          : normalizeForwardPayloadContent(message.content),
        permalinkOptions,
      ),
    )
    .join("\n");
}

export function toggleForwardRecipient(selectedUserIds: number[], userId: number): number[] {
  if (selectedUserIds.includes(userId)) {
    return selectedUserIds.filter((id) => id !== userId);
  }
  return [...selectedUserIds, userId].sort((a, b) => a - b);
}

export function resolveForwardDraftTarget(
  streamName: string,
  topic: string,
  to: number[] | undefined,
  streams: ForwardTargetStream[],
): ForwardDraftTarget | null {
  if (to != null && to.length > 0) {
    const sortedRecipientIds = [...to].sort((a, b) => a - b);
    return {
      route: withCurrentOrgRoute(`/dm/${sortedRecipientIds.join(",")}`),
      draftType: "private",
      draftTo: sortedRecipientIds,
      draftTopic: "general",
    };
  }

  const matchedStream = streams.find((stream) => stream.name === streamName);
  if (matchedStream == null) {
    return null;
  }

  const normalizedTopic = topic.trim().length > 0 ? topic.trim() : "general";
  return {
    route: withCurrentOrgRoute(
      `/stream/${slugForStream(matchedStream)}/topic/${encodeURIComponent(normalizedTopic)}`,
    ),
    draftType: "stream",
    draftTo: [matchedStream.stream_id],
    draftTopic: normalizedTopic,
  };
}

export function mergeForwardDraftContent(
  forwardedContent: string,
  existingDraftContent: string | undefined,
): string {
  const normalizedExisting = existingDraftContent?.trim();
  if (normalizedExisting == null || normalizedExisting.length === 0) {
    return forwardedContent;
  }
  return `${forwardedContent}\n${normalizedExisting}`;
}

export function setPendingForwardPrefill(route: string, content: string): void {
  pendingForwardPrefills.set(route, content);
}

export function consumePendingForwardPrefill(route: string): string | undefined {
  const pending = pendingForwardPrefills.get(route);
  if (pending == null) return undefined;
  pendingForwardPrefills.delete(route);
  return pending;
}

export function resolveForwardTargetRoute(
  streamName: string,
  topic: string,
  to: number[] | undefined,
  streams: ForwardTargetStream[],
): string | null {
  return resolveForwardDraftTarget(streamName, topic, to, streams)?.route ?? null;
}
