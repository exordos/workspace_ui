import type { MockMessage } from "~/shared/api/zulip.types";
import { buildZulipQuoteBlock } from "~/shared/lib/message-zulip-quote.lib";
import { workspaceMessengerTopicRoute } from "~/shared/lib/workspace-messenger-route.lib";
import { buildZulipQuoteHeader } from "~/shared/lib/zulip-quote-header.lib";
import { resolveReplyQuoteContent } from "./chat-reply-quote.lib";

export type ForwardableMessage = Pick<
  MockMessage,
  | "id"
  | "sender_full_name"
  | "sender_id"
  | "content"
  | "markdown_source"
  | "stream_id"
  | "subject"
  | "display_recipient"
  | "channel"
>;

interface ForwardWorkspaceTopicTarget {
  orgId: string;
  projectId: string;
  streamUuid: string;
  topicUuid: string;
}

const pendingForwardPrefills = new Map<string, string>();

function buildSingleForwardQuote(message: ForwardableMessage, content: string): string {
  const header = buildZulipQuoteHeader({
    senderName: message.sender_full_name,
    senderId: message.sender_id,
    wroteLabel: "wrote",
  });
  return buildZulipQuoteBlock(header, content);
}

export function buildForwardQuote(
  messages: ForwardableMessage[],
  selectedTextQuote?: string,
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
      ),
    )
    .join("\n\n");
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

export function resolveForwardTargetRoute(target: ForwardWorkspaceTopicTarget): string {
  return workspaceMessengerTopicRoute(target);
}
