/**
 * Workspace read/unread and topic resolution (flags API + topic rename).
 */
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import { logScrollReadFlow } from "~/shared/lib/message-flow-debug.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import {
  buildSidebarMarkReadNarrowForChannel,
  buildSidebarMarkReadNarrowForDm,
  buildSidebarMarkReadNarrowForTopic,
} from "~/shared/lib/messenger-mark-read-narrow.lib";
import {
  normalizeMessengerMessagesNarrowForApi,
  type MessengerMessagesNarrowClause,
  messengerTopicNarrowOperandForApi,
} from "~/shared/lib/messenger-topic-narrow.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { toResolvedTopicName, toUnresolvedTopicName } from "~/shared/lib/topic-resolve";
import {
  messengerPipelineGet,
  messengerPipelinePatch,
  messengerPipelinePost,
} from "./messenger-pipeline.internal";
import { validateMessageIds } from "./messenger-validation.internal";

const log = createLogger("messenger-read-state");

/** Max unread messages marked per sidebar flags/narrow request. */
export const MARK_READ_NARROW_NUM_AFTER = 5000;

export interface MarkUnreadInNarrowOptions {
  numAfter?: number;
}

/**
 * Marks unread messages in a narrow as read (POST /api/v1/messages/flags/narrow).
 * Sidebar context menu only — not for open-chat viewport read.
 */
export async function markUnreadInNarrow(
  narrow: readonly MessengerMessagesNarrowClause[],
  options?: MarkUnreadInNarrowOptions,
): Promise<boolean> {
  const numAfter = options?.numAfter ?? MARK_READ_NARROW_NUM_AFTER;
  const normalizedNarrow = normalizeMessengerMessagesNarrowForApi([...narrow]);
  logScrollReadFlow("api:markUnreadInNarrow", {
    numAfter,
    narrow: normalizedNarrow,
  });

  const post = async (clauses: MessengerMessagesNarrowClause[]) => {
    const res = await messengerPipelinePost("messages/flags/narrow", {
      anchor: "oldest",
      include_anchor: "false",
      num_before: "0",
      num_after: String(numAfter),
      narrow: JSON.stringify(clauses),
      op: "add",
      flag: "read",
    });
    return res.ok;
  };

  if (await post(normalizedNarrow)) {
    return true;
  }

  const hasChannel = normalizedNarrow.some((c) => c.operator === "channel");
  if (!hasChannel) {
    return false;
  }

  const streamNarrow = normalizedNarrow.map((clause) =>
    clause.operator === "channel" ? { ...clause, operator: "stream" } : clause,
  );
  logScrollReadFlow("api:markUnreadInNarrow:retryStreamOperator", {});
  return post(streamNarrow);
}

/** Bulk-marks all unread in a DM as read (sidebar context menu). */
export async function markDmAsRead(userIds: number[]): Promise<boolean> {
  return markUnreadInNarrow(buildSidebarMarkReadNarrowForDm(userIds));
}

/** Bulk-marks all unread in a stream as read (sidebar context menu). */
export async function markStreamAsRead(streamId: string): Promise<boolean> {
  return markUnreadInNarrow(buildSidebarMarkReadNarrowForChannel(streamId));
}

/** Bulk-marks all unread in a stream topic as read (sidebar context menu). */
export async function markTopicAsRead(streamId: string, topic: string): Promise<boolean> {
  guard.streamUuid(streamId, "markTopicAsRead");
  return markUnreadInNarrow(buildSidebarMarkReadNarrowForTopic(streamId, topic));
}

async function findTopicAnchorMessageId(
  streamId: string,
  topic: string,
): Promise<MessageId | null> {
  const normalizedTopic = normalizeTopicForIdentity(topic);
  const anchorMessageResponse = await messengerPipelineGet("/messages", {
    anchor: "oldest",
    num_before: "0",
    num_after: "1",
    include_anchor: "true",
    allow_empty_topic_name: "true",
    client_gravatar: "false",
    apply_markdown: "false",
    narrow: JSON.stringify([
      { operator: "stream", operand: streamId },
      { operator: "topic", operand: messengerTopicNarrowOperandForApi(normalizedTopic) },
    ]),
  });

  if (!anchorMessageResponse?.ok) {
    return null;
  }

  const anchorData = anchorMessageResponse.data as {
    result?: string;
    messages?: { id?: MessageId }[];
  };
  if (anchorData.result === "error") {
    return null;
  }

  const anchorMessageId = anchorData.messages?.[0]?.id;
  if (anchorMessageId == null) {
    return null;
  }
  guard.messageId(anchorMessageId, "findTopicAnchorMessageId");
  return anchorMessageId;
}

async function patchStreamTopicForAllMessages(
  anchorMessageId: MessageId,
  targetTopic: string,
): Promise<boolean> {
  const patchResponse = await messengerPipelinePatch(`messages/${anchorMessageId}`, {
    topic: targetTopic,
    propagate_mode: "change_all",
    send_notification_to_old_thread: "false",
    send_notification_to_new_thread: "false",
    send_webhook_notifications: "false",
  });

  if (!patchResponse.ok) {
    return false;
  }

  const patchData = patchResponse.data as { result?: string };
  return patchData.result !== "error";
}

/**
 * Renames a stream topic by PATCHing the anchor message with propagate_mode=change_all.
 */
export async function renameStreamTopic(
  streamId: string,
  topic: string,
  newTopic: string,
): Promise<boolean> {
  guard.streamUuid(streamId, "renameStreamTopic.streamId");
  const normalizedTopic = normalizeTopicForIdentity(topic);
  const targetTopic = normalizeTopicForIdentity(newTopic.trim());
  if (targetTopic.length === 0) {
    return false;
  }
  if (targetTopic === normalizedTopic) {
    return true;
  }

  const anchorMessageId = await findTopicAnchorMessageId(streamId, topic);
  if (anchorMessageId == null) {
    return false;
  }

  return patchStreamTopicForAllMessages(anchorMessageId, targetTopic);
}

async function patchStreamTopicToChannelForAllMessages(
  anchorMessageId: MessageId,
  targetStreamId: string,
  targetTopic: string,
): Promise<boolean> {
  const patchResponse = await messengerPipelinePatch(`messages/${anchorMessageId}`, {
    stream_uuid: targetStreamId,
    topic: targetTopic,
    propagate_mode: "change_all",
    send_notification_to_old_thread: "false",
    send_notification_to_new_thread: "false",
    send_webhook_notifications: "false",
  });

  if (!patchResponse.ok) {
    return false;
  }

  const patchData = patchResponse.data as { result?: string; code?: string };
  if (patchData.result === "error") {
    if (patchData.code === "MOVE_MESSAGES_TIME_LIMIT_EXCEEDED") {
      log.warn("Topic move to channel blocked by time limit", { anchorMessageId, targetStreamId });
    }
    return false;
  }
  return true;
}

/**
 * Moves an entire stream topic to another channel via PATCH with propagate_mode=change_all.
 */
export async function moveStreamTopicToChannel(
  sourceStreamId: string,
  topic: string,
  targetStreamId: string,
  targetTopic: string,
): Promise<boolean> {
  guard.streamUuid(sourceStreamId, "moveStreamTopicToChannel.sourceStreamId");
  guard.streamUuid(targetStreamId, "moveStreamTopicToChannel.targetStreamId");
  const normalizedTargetTopic = normalizeTopicForIdentity(targetTopic.trim());
  if (normalizedTargetTopic.length === 0) {
    return false;
  }
  if (sourceStreamId === targetStreamId) {
    return false;
  }

  const anchorMessageId = await findTopicAnchorMessageId(sourceStreamId, topic);
  if (anchorMessageId == null) {
    return false;
  }

  return patchStreamTopicToChannelForAllMessages(
    anchorMessageId,
    targetStreamId,
    normalizedTargetTopic,
  );
}

/**
 * Marks a stream topic as resolved/unresolved by renaming the whole topic thread.
 *
 * Workspace models "resolved" as a topic-name convention (checkmark prefix).
 * We PATCH the first message in the topic with propagate_mode=change_all.
 */
export async function setTopicResolvedState(
  streamId: string,
  topic: string,
  resolved: boolean,
): Promise<boolean> {
  guard.streamUuid(streamId, "setTopicResolvedState.streamId");
  const normalizedTopic = normalizeTopicForIdentity(topic);
  const targetTopic = resolved
    ? toResolvedTopicName(normalizedTopic)
    : toUnresolvedTopicName(normalizedTopic);

  if (targetTopic === normalizedTopic) {
    return true;
  }

  const anchorMessageId = await findTopicAnchorMessageId(streamId, topic);
  if (anchorMessageId == null) {
    return false;
  }

  return patchStreamTopicForAllMessages(anchorMessageId, targetTopic);
}

/** Marks messages as read (POST /api/v1/messages/flags). Used for viewport/scroll read in open chat. */
export async function markMessagesAsRead(messageIds: MessageId[]): Promise<void> {
  if (messageIds.length === 0) return;
  const validatedMessageIds = validateMessageIds(messageIds, "markMessagesAsRead.messageIds");
  logScrollReadFlow("api:markMessagesAsRead", { count: validatedMessageIds.length });
  await messengerPipelinePost("messages/flags", {
    messages: JSON.stringify(validatedMessageIds),
    op: "add",
    flag: "read",
  });
}
