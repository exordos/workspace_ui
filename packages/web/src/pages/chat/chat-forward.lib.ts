import type { MockMessage } from "~/shared/api/messenger.types";
import { messageAuthorId } from "~/shared/lib/message-author.lib";
import { buildWorkspaceQuoteBlock } from "~/shared/lib/message-quote.lib";
import { buildWorkspaceQuoteHeader } from "~/shared/lib/messenger-quote-header.lib";
import { buildMessengerMessageWebPermalink } from "~/shared/lib/messenger-web-permalink.lib";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { encodeTopicForRoute, normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { slugForStream } from "~/widgets/sidebar/sidebar.lib";
import { resolveReplyQuoteContent } from "./chat-reply-quote.lib";

export type ForwardableMessage = Pick<
  MockMessage,
  | "id"
  | "sender_full_name"
  | "sender_id"
  | "author_uuid"
  | "sender_uuid"
  | "is_own"
  | "content"
  | "markdown_source"
  | "stream_uuid"
  | "subject"
  | "display_recipient"
  | "channel"
>;

interface ForwardTargetStream {
  streamUuid: string;
  name: string;
}

interface ForwardDraftTarget {
  route: string;
  draftType: "stream" | "private";
  draftTo: (number | string)[];
  draftTopic: string;
}

const pendingForwardPrefills = new Map<string, string>();

interface ForwardQuotePermalinkOptions {
  realmBaseUrl: string;
  wroteLabel: string;
  resolveStreamName: (streamUuid: string, message: ForwardableMessage) => string | undefined;
}

function buildSingleForwardQuote(
  message: ForwardableMessage,
  content: string,
  permalinkOptions?: ForwardQuotePermalinkOptions,
): string {
  const permalinkUrl =
    permalinkOptions != null && permalinkOptions.realmBaseUrl.trim().length > 0
      ? buildMessengerMessageWebPermalink(permalinkOptions.realmBaseUrl, message, (streamId) =>
          permalinkOptions.resolveStreamName(streamId, message),
        )
      : null;
  const header = buildWorkspaceQuoteHeader({
    senderName: message.sender_full_name,
    senderId: messageAuthorId(message),
    wroteLabel: permalinkOptions?.wroteLabel ?? "wrote",
    permalinkUrl,
  });
  return buildWorkspaceQuoteBlock(header, content);
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
        resolveReplyQuoteContent(
          message,
          messages.length === 1 && index === 0 ? singleMessageQuote : undefined,
        ),
        permalinkOptions,
      ),
    )
    .join("\n\n");
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
      draftTopic: "",
    };
  }

  const matchedStream = streams.find((stream) => stream.name === streamName);
  if (matchedStream == null) {
    return null;
  }

  const normalizedTopic = normalizeTopicForIdentity(topic);
  if (normalizedTopic.length === 0) {
    return null;
  }
  return {
    route: withCurrentOrgRoute(
      `/stream/${slugForStream({ streamUuid: matchedStream.streamUuid })}/topic/${encodeURIComponent(
        encodeTopicForRoute(normalizedTopic),
      )}`,
    ),
    draftType: "stream",
    draftTo: [matchedStream.streamUuid],
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
  return `${forwardedContent}\n\n${normalizedExisting}`;
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
