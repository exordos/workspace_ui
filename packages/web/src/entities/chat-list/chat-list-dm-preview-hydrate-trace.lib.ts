/**
 * Always-on (dev: info) traces for DM preview hydration from register metadata.
 * Filter browser console by `[dmPreviewHydrate]` or logger scope `dmPreviewHydrate`.
 */
import type { ZulipRecentPrivateConversation } from "~/shared/api/zulip.types";
import { createLogger } from "~/shared/lib/logger";

const traceLog = createLogger("dmPreviewHydrate");

export function traceDmPreviewHydrate(phase: string, data?: Record<string, unknown>): void {
  traceLog.info(phase, data ?? {});
}

export function summarizeRecentPrivateConversationsForTrace(
  conversations: Record<string, ZulipRecentPrivateConversation> | undefined,
): Record<string, unknown> {
  if (conversations == null) {
    return { present: false };
  }
  if (Array.isArray(conversations)) {
    return { present: true, format: "array(unparsed)", conversationCount: conversations.length };
  }
  const entries = Object.entries(conversations);
  let withMaxMessageId = 0;
  let withUnreadIds = 0;
  const maxMessageIdSample: number[] = [];
  for (const [, conversation] of entries) {
    const maxId = conversation.max_message_id;
    if (maxId != null && Number.isInteger(maxId) && maxId > 0) {
      withMaxMessageId += 1;
      if (maxMessageIdSample.length < 8) {
        maxMessageIdSample.push(maxId);
      }
    }
    if ((conversation.unread_message_ids?.length ?? 0) > 0) {
      withUnreadIds += 1;
    }
  }
  return {
    present: true,
    format: "map",
    conversationCount: entries.length,
    withMaxMessageId,
    withUnreadIds,
    maxMessageIdSample,
  };
}
