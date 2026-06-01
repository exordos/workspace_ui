/**
 * Zulip read/unread and topic resolution (flags API + topic rename).
 */
import { guard } from "~/shared/lib/guards";
import { logScrollReadFlow } from "~/shared/lib/message-flow-debug.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { toResolvedTopicName, toUnresolvedTopicName } from "~/shared/lib/topic-resolve";
import { zulipTopicNarrowOperandForApi } from "~/shared/lib/zulip-topic-narrow.lib";
import { zulipPipelineGet, zulipPipelinePatch, zulipPipelinePost } from "./zulip-pipeline.internal";
import { validateMessageIds } from "./zulip-validation.internal";

/** Marks messages as read (POST /api/v1/messages/flags). Call when opening a chat. */
export async function markMessagesAsRead(messageIds: number[]): Promise<void> {
  if (messageIds.length === 0) return;
  const validatedMessageIds = validateMessageIds(messageIds, "markMessagesAsRead.messageIds");
  logScrollReadFlow("api:markMessagesAsRead", { count: validatedMessageIds.length });
  await zulipPipelinePost("messages/flags", {
    messages: JSON.stringify(validatedMessageIds),
    op: "add",
    flag: "read",
  });
}

/** Bulk-marks all messages in a DM chat as read (POST /api/v1/messages/flags/narrow). */
export async function markDmAsRead(userIds: number[]): Promise<boolean> {
  const validatedUserIds = guard
    .nonEmptyArray(userIds, "markDmAsRead.userIds")
    .map((userId) => guard.userId(userId, "markDmAsRead.userIds"));
  const res = await zulipPipelinePost("messages/flags/narrow", {
    anchor: "newest",
    include_anchor: "false",
    num_before: "5000",
    num_after: "0",
    narrow: JSON.stringify([{ operator: "dm", operand: validatedUserIds }]),
    op: "add",
    flag: "read",
  });
  return res.ok;
}

/** Bulk-marks all messages in a stream as read (POST /api/v1/messages/flags/narrow). */
export async function markStreamAsRead(streamId: number): Promise<boolean> {
  guard.streamId(streamId, "markStreamAsRead");
  const res = await zulipPipelinePost("messages/flags/narrow", {
    anchor: "newest",
    include_anchor: "false",
    num_before: "5000",
    num_after: "0",
    narrow: JSON.stringify([{ operator: "stream", operand: streamId }]),
    op: "add",
    flag: "read",
  });
  return res.ok;
}

/** Bulk-marks all messages in a stream topic as read (POST /api/v1/messages/flags/narrow). */
export async function markTopicAsRead(streamId: number, topic: string): Promise<boolean> {
  guard.streamId(streamId, "markTopicAsRead");
  const normalizedTopic = normalizeTopicForIdentity(topic);
  const res = await zulipPipelinePost("messages/flags/narrow", {
    anchor: "newest",
    include_anchor: "false",
    num_before: "5000",
    num_after: "0",
    narrow: JSON.stringify([
      { operator: "stream", operand: streamId },
      { operator: "topic", operand: zulipTopicNarrowOperandForApi(normalizedTopic) },
    ]),
    op: "add",
    flag: "read",
  });
  return res.ok;
}

async function findTopicAnchorMessageId(streamId: number, topic: string): Promise<number | null> {
  const normalizedTopic = normalizeTopicForIdentity(topic);
  const anchorMessageResponse = await zulipPipelineGet("/messages", {
    anchor: "oldest",
    num_before: "0",
    num_after: "1",
    include_anchor: "true",
    allow_empty_topic_name: "true",
    client_gravatar: "false",
    apply_markdown: "false",
    narrow: JSON.stringify([
      { operator: "stream", operand: streamId },
      { operator: "topic", operand: zulipTopicNarrowOperandForApi(normalizedTopic) },
    ]),
  });

  if (!anchorMessageResponse?.ok) {
    return null;
  }

  const anchorData = anchorMessageResponse.data as {
    result?: string;
    messages?: { id?: number }[];
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
  anchorMessageId: number,
  targetTopic: string,
): Promise<boolean> {
  const patchResponse = await zulipPipelinePatch(`messages/${anchorMessageId}`, {
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
  streamId: number,
  topic: string,
  newTopic: string,
): Promise<boolean> {
  guard.streamId(streamId, "renameStreamTopic.streamId");
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

/**
 * Marks a stream topic as resolved/unresolved by renaming the whole topic thread.
 *
 * Zulip models "resolved" as a topic-name convention (checkmark prefix).
 * We PATCH the first message in the topic with propagate_mode=change_all.
 */
export async function setTopicResolvedState(
  streamId: number,
  topic: string,
  resolved: boolean,
): Promise<boolean> {
  guard.streamId(streamId, "setTopicResolvedState.streamId");
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
