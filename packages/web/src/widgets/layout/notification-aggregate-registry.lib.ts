import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import { chatKeyFromRawMessage } from "~/shared/lib/message-cache-keys.lib";
import { isMessageId } from "~/shared/lib/message-id.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import {
  buildNotificationAggregateTag,
  buildNotificationMessageScopeKey,
  buildScopedNotificationKey,
} from "./layout-notification-tag.lib";
import type { NotificationTitleContext } from "./layout-notification-title.lib";

export { buildNotificationAggregateTag } from "./layout-notification-tag.lib";

export interface NotificationAggregateSnapshot {
  tag: string;
  count: number;
  lastMessageId: MessageId;
  latestBody: string;
  latestClickRoute?: string;
  titleContext: NotificationTitleContext;
}

interface NotificationAggregateMessageState {
  body: string;
  clickRoute?: string;
  titleContext: NotificationTitleContext;
}

interface NotificationAggregateEntry {
  messages: Map<MessageId, NotificationAggregateMessageState>;
}

const aggregatesByTag = new Map<string, NotificationAggregateEntry>();
const messageIdToAggregateTag = new Map<string, string>();

export function buildNotificationBucketKeyFromMessage(
  message: WorkspaceRawMessage,
  currentUserId: UserId | null,
  currentInstanceId: string | null,
): string | null {
  const chatKey = chatKeyFromRawMessage(message, currentUserId);
  if (chatKey == null) {
    return null;
  }

  const baseKey =
    message.type === "stream" && message.stream_uuid != null
      ? Number.isInteger(message.sender_id) && message.sender_id > 0
        ? `${chatKey}:sender:${message.sender_id}`
        : null
      : chatKey;
  if (baseKey == null) {
    return null;
  }

  return buildScopedNotificationKey(baseKey, currentInstanceId);
}

function buildSnapshot(
  tag: string,
  entry: NotificationAggregateEntry,
): NotificationAggregateSnapshot | null {
  let lastMessageId: MessageId | null = null;
  let lastState: NotificationAggregateMessageState | null = null;

  for (const [messageId, state] of entry.messages) {
    lastMessageId = messageId;
    lastState = state;
  }

  if (lastState == null || lastMessageId == null) {
    return null;
  }

  return {
    tag,
    count: entry.messages.size,
    lastMessageId,
    latestBody: lastState.body,
    latestClickRoute: lastState.clickRoute,
    titleContext: lastState.titleContext,
  };
}

export function upsertNotificationAggregate(input: {
  message: WorkspaceRawMessage;
  currentUserId: UserId | null;
  currentInstanceId: string | null;
  body: string;
  clickRoute?: string;
  titleContext: NotificationTitleContext;
}): NotificationAggregateSnapshot | null {
  const { message, currentUserId, currentInstanceId, body, clickRoute, titleContext } = input;
  if (!isMessageId(message.id)) {
    return null;
  }

  const bucketKey = buildNotificationBucketKeyFromMessage(
    message,
    currentUserId,
    currentInstanceId,
  );
  if (bucketKey == null) {
    return null;
  }

  const tag = buildNotificationAggregateTag(bucketKey, null);
  const messageScopeKey = buildNotificationMessageScopeKey(message.id, currentInstanceId);
  const existingTag = messageIdToAggregateTag.get(messageScopeKey);
  if (existingTag != null && existingTag !== tag) {
    return null;
  }

  const entry = aggregatesByTag.get(tag) ?? {
    messages: new Map<MessageId, NotificationAggregateMessageState>(),
  };
  entry.messages.set(message.id, { body, clickRoute, titleContext });
  aggregatesByTag.set(tag, entry);
  messageIdToAggregateTag.set(messageScopeKey, tag);

  return buildSnapshot(tag, entry);
}

export function consumeReadMessagesFromNotificationAggregates(
  messageIds: MessageId[],
  currentInstanceId: string | null,
): {
  closedTags: string[];
  updatedSnapshots: NotificationAggregateSnapshot[];
  untrackedMessageIds: MessageId[];
} {
  const uniqueValidIds = new Set<MessageId>();
  const affectedTags = new Set<string>();
  const untrackedMessageIds: MessageId[] = [];

  for (const messageId of messageIds) {
    if (!isMessageId(messageId)) {
      continue;
    }
    uniqueValidIds.add(messageId);
  }

  for (const messageId of uniqueValidIds) {
    const messageScopeKey = buildNotificationMessageScopeKey(messageId, currentInstanceId);
    const tag = messageIdToAggregateTag.get(messageScopeKey);
    if (tag == null) {
      untrackedMessageIds.push(messageId);
      continue;
    }

    const entry = aggregatesByTag.get(tag);
    if (entry == null) {
      messageIdToAggregateTag.delete(messageScopeKey);
      untrackedMessageIds.push(messageId);
      continue;
    }

    entry.messages.delete(messageId);
    messageIdToAggregateTag.delete(messageScopeKey);
    affectedTags.add(tag);
  }

  const closedTags: string[] = [];
  const updatedSnapshots: NotificationAggregateSnapshot[] = [];

  for (const tag of affectedTags) {
    const entry = aggregatesByTag.get(tag);
    if (entry == null || entry.messages.size === 0) {
      aggregatesByTag.delete(tag);
      closedTags.push(tag);
      continue;
    }

    const snapshot = buildSnapshot(tag, entry);
    if (snapshot == null) {
      aggregatesByTag.delete(tag);
      closedTags.push(tag);
      continue;
    }

    updatedSnapshots.push(snapshot);
  }

  return { closedTags, updatedSnapshots, untrackedMessageIds };
}

export function drainNotificationAggregateTagsForInstance(
  currentInstanceId: string | null,
): string[] {
  const scopedPrefix =
    currentInstanceId == null ? "bucket:" : buildNotificationAggregateTag("", currentInstanceId);
  const tags = [...aggregatesByTag.keys()].filter((tag) => tag.startsWith(scopedPrefix));

  for (const tag of tags) {
    aggregatesByTag.delete(tag);
  }

  for (const [messageScopeKey, tag] of messageIdToAggregateTag) {
    if (tags.includes(tag)) {
      messageIdToAggregateTag.delete(messageScopeKey);
    }
  }

  return tags;
}

export function clearNotificationAggregateRegistry(): void {
  aggregatesByTag.clear();
  messageIdToAggregateTag.clear();
}
