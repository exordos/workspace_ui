import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { chatKeyFromRawMessage } from "~/shared/lib/message-cache-keys.lib";
import type { NotificationTitleContext } from "./layout-notification-title.lib";

export interface NotificationAggregateSnapshot {
  tag: string;
  count: number;
  lastMessageId: number;
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
  messages: Map<number, NotificationAggregateMessageState>;
}

const aggregatesByTag = new Map<string, NotificationAggregateEntry>();
const messageIdToAggregateTag = new Map<number, string>();

export function buildNotificationBucketKeyFromMessage(
  message: ZulipRawMessage,
  currentUserId: number | null,
): string | null {
  const chatKey = chatKeyFromRawMessage(message, currentUserId);
  if (chatKey == null) {
    return null;
  }

  if (message.type === "stream" && message.stream_id != null) {
    if (!Number.isInteger(message.sender_id) || message.sender_id <= 0) {
      return null;
    }
    return `${chatKey}:sender:${message.sender_id}`;
  }

  return chatKey;
}

export function buildNotificationAggregateTag(bucketKey: string): string {
  return `bucket:${bucketKey}`;
}

function buildSnapshot(
  tag: string,
  entry: NotificationAggregateEntry,
): NotificationAggregateSnapshot | null {
  let lastMessageId = 0;
  let lastState: NotificationAggregateMessageState | null = null;

  for (const [messageId, state] of entry.messages) {
    if (messageId > lastMessageId) {
      lastMessageId = messageId;
      lastState = state;
    }
  }

  if (lastState == null || lastMessageId <= 0) {
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
  message: ZulipRawMessage;
  currentUserId: number | null;
  body: string;
  clickRoute?: string;
  titleContext: NotificationTitleContext;
}): NotificationAggregateSnapshot | null {
  const { message, currentUserId, body, clickRoute, titleContext } = input;
  if (!Number.isInteger(message.id) || message.id <= 0) {
    return null;
  }

  const bucketKey = buildNotificationBucketKeyFromMessage(message, currentUserId);
  if (bucketKey == null) {
    return null;
  }

  const tag = buildNotificationAggregateTag(bucketKey);
  const existingTag = messageIdToAggregateTag.get(message.id);
  if (existingTag != null && existingTag !== tag) {
    return null;
  }

  const entry = aggregatesByTag.get(tag) ?? {
    messages: new Map<number, NotificationAggregateMessageState>(),
  };
  entry.messages.set(message.id, { body, clickRoute, titleContext });
  aggregatesByTag.set(tag, entry);
  messageIdToAggregateTag.set(message.id, tag);

  return buildSnapshot(tag, entry);
}

export function consumeReadMessagesFromNotificationAggregates(messageIds: number[]): {
  closedTags: string[];
  updatedSnapshots: NotificationAggregateSnapshot[];
  untrackedMessageIds: number[];
} {
  const uniqueValidIds = new Set<number>();
  const affectedTags = new Set<string>();
  const untrackedMessageIds: number[] = [];

  for (const messageId of messageIds) {
    if (!Number.isInteger(messageId) || messageId <= 0) {
      continue;
    }
    uniqueValidIds.add(messageId);
  }

  for (const messageId of uniqueValidIds) {
    const tag = messageIdToAggregateTag.get(messageId);
    if (tag == null) {
      untrackedMessageIds.push(messageId);
      continue;
    }

    const entry = aggregatesByTag.get(tag);
    if (entry == null) {
      messageIdToAggregateTag.delete(messageId);
      untrackedMessageIds.push(messageId);
      continue;
    }

    entry.messages.delete(messageId);
    messageIdToAggregateTag.delete(messageId);
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

export function drainAllNotificationAggregateTags(): string[] {
  const tags = [...aggregatesByTag.keys()];
  aggregatesByTag.clear();
  messageIdToAggregateTag.clear();
  return tags;
}

export function clearNotificationAggregateRegistry(): void {
  aggregatesByTag.clear();
  messageIdToAggregateTag.clear();
}
