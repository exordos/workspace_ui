import type { MessengerBackgroundNotificationCandidate } from "~/entities/messenger/messenger-background-projection.model";
import { compareMessengerMessageOrder } from "~/entities/messenger/messenger-read-boundary.lib";
import {
  buildNotificationAggregateTag,
  buildWorkspaceNotificationBucketKey,
  buildWorkspaceNotificationMessageScopeKey,
} from "./layout-notification-tag.lib";
import type { NotificationTitleContext } from "./layout-notification-title.lib";

export { buildNotificationAggregateTag } from "./layout-notification-tag.lib";

export interface NotificationAggregateSnapshot {
  tag: string;
  count: number;
  lastMessageUuid: string;
  latestBody: string;
  latestClickRoute?: string;
  titleContext: NotificationTitleContext;
}

type NotificationAggregateCandidate = Pick<
  MessengerBackgroundNotificationCandidate,
  | "ownerKey"
  | "messageUuid"
  | "authorUuid"
  | "audience"
  | "streamConversationId"
  | "topicConversationId"
  | "messageRoute"
  | "createdAt"
>;

interface NotificationAggregateMessageState {
  body: string;
  clickRoute?: string;
  titleContext: NotificationTitleContext;
  /** Ordered by when the message was sent — the order it reaches this registry is not the same thing. */
  createdAt: string;
}

interface NotificationAggregateEntry {
  messages: Map<string, NotificationAggregateMessageState>;
}

const aggregatesByTag = new Map<string, NotificationAggregateEntry>();
const messageUuidToAggregateTag = new Map<string, string>();

function normalizeNonEmptyString(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function buildNotificationBucketKeyFromCandidate(
  candidate: NotificationAggregateCandidate,
): string | null {
  const ownerKey = normalizeNonEmptyString(candidate.ownerKey);
  const authorUuid = normalizeNonEmptyString(candidate.authorUuid);
  const streamConversationId = normalizeNonEmptyString(candidate.streamConversationId);
  const topicConversationId = normalizeNonEmptyString(candidate.topicConversationId);
  if (ownerKey == null || streamConversationId == null) {
    return null;
  }

  if (candidate.audience === "private") {
    return buildWorkspaceNotificationBucketKey(ownerKey, streamConversationId);
  }

  if (topicConversationId == null || authorUuid == null) {
    return null;
  }

  // Для unknown не пытаемся "угадать" личку: безопаснее сохранить старую механику
  // канального стекинга, чем смешать разных авторов в один bucket.
  return buildWorkspaceNotificationBucketKey(
    ownerKey,
    `${topicConversationId}:author:${authorUuid}`,
  );
}

function buildSnapshot(
  tag: string,
  entry: NotificationAggregateEntry,
): NotificationAggregateSnapshot | null {
  let lastMessageUuid: string | null = null;
  let lastState: NotificationAggregateMessageState | null = null;

  for (const [messageUuid, state] of entry.messages) {
    if (
      lastState == null ||
      compareMessengerMessageOrder(
        { createdAt: state.createdAt, messageUuid },
        { createdAt: lastState.createdAt, messageUuid: lastMessageUuid ?? messageUuid },
      ) > 0
    ) {
      lastMessageUuid = messageUuid;
      lastState = state;
    }
  }

  if (lastState == null || lastMessageUuid == null) {
    return null;
  }

  return {
    tag,
    count: entry.messages.size,
    lastMessageUuid,
    latestBody: lastState.body,
    latestClickRoute: lastState.clickRoute,
    titleContext: lastState.titleContext,
  };
}

export function upsertNotificationAggregate(input: {
  candidate: NotificationAggregateCandidate;
  body: string;
  clickRoute?: string;
  titleContext: NotificationTitleContext;
}): NotificationAggregateSnapshot | null {
  const { candidate, body, clickRoute, titleContext } = input;
  const messageUuid = normalizeNonEmptyString(candidate.messageUuid);
  const ownerKey = normalizeNonEmptyString(candidate.ownerKey);
  if (messageUuid == null || ownerKey == null) {
    return null;
  }

  const bucketKey = buildNotificationBucketKeyFromCandidate(candidate);
  if (bucketKey == null) {
    return null;
  }

  const tag = buildNotificationAggregateTag(bucketKey);
  const messageScopeKey = buildWorkspaceNotificationMessageScopeKey(ownerKey, messageUuid);
  const existingTag = messageUuidToAggregateTag.get(messageScopeKey);
  if (existingTag != null && existingTag !== tag) {
    return null;
  }

  const entry = aggregatesByTag.get(tag) ?? {
    messages: new Map<string, NotificationAggregateMessageState>(),
  };
  entry.messages.set(messageUuid, {
    body,
    clickRoute: clickRoute ?? candidate.messageRoute,
    titleContext,
    createdAt: candidate.createdAt,
  });
  aggregatesByTag.set(tag, entry);
  messageUuidToAggregateTag.set(messageScopeKey, tag);

  return buildSnapshot(tag, entry);
}

export function consumeNotificationAggregateByTag(tag: string): string[] {
  const entry = aggregatesByTag.get(tag);
  if (entry == null) {
    return [];
  }

  aggregatesByTag.delete(tag);

  const messageUuids = [...entry.messages.keys()];
  for (const [messageScopeKey, aggregateTag] of messageUuidToAggregateTag) {
    if (aggregateTag === tag) {
      messageUuidToAggregateTag.delete(messageScopeKey);
    }
  }

  return messageUuids;
}

export function consumeReadMessagesFromNotificationAggregates(
  messageUuids: string[],
  ownerKey: string,
): {
  closedTags: string[];
  untrackedMessageUuids: string[];
} {
  const uniqueValidMessageUuids = new Set<string>();
  const untrackedMessageUuids: string[] = [];

  for (const messageUuid of messageUuids) {
    const normalizedMessageUuid = normalizeNonEmptyString(messageUuid);
    if (normalizedMessageUuid != null) {
      uniqueValidMessageUuids.add(normalizedMessageUuid);
    }
  }

  const normalizedOwnerKey = normalizeNonEmptyString(ownerKey);
  if (normalizedOwnerKey == null) {
    return {
      closedTags: [],
      untrackedMessageUuids: [...uniqueValidMessageUuids],
    };
  }

  const readMessageUuidsByTag = new Map<string, Set<string>>();

  for (const messageUuid of uniqueValidMessageUuids) {
    const messageScopeKey = buildWorkspaceNotificationMessageScopeKey(
      normalizedOwnerKey,
      messageUuid,
    );
    const tag = messageUuidToAggregateTag.get(messageScopeKey);
    if (tag == null) {
      untrackedMessageUuids.push(messageUuid);
      continue;
    }

    const entry = aggregatesByTag.get(tag);
    if (entry == null) {
      messageUuidToAggregateTag.delete(messageScopeKey);
      untrackedMessageUuids.push(messageUuid);
      continue;
    }

    const readMessageUuids = readMessageUuidsByTag.get(tag) ?? new Set<string>();
    readMessageUuids.add(messageUuid);
    readMessageUuidsByTag.set(tag, readMessageUuids);
  }

  const closedTags: string[] = [];

  for (const [tag, readMessageUuids] of readMessageUuidsByTag) {
    const entry = aggregatesByTag.get(tag);
    const snapshot = entry == null ? null : buildSnapshot(tag, entry);
    if (entry == null || snapshot == null || readMessageUuids.has(snapshot.lastMessageUuid)) {
      consumeNotificationAggregateByTag(tag);
      closedTags.push(tag);
      continue;
    }

    for (const messageUuid of readMessageUuids) {
      entry.messages.delete(messageUuid);
      messageUuidToAggregateTag.delete(
        buildWorkspaceNotificationMessageScopeKey(normalizedOwnerKey, messageUuid),
      );
    }
  }

  return { closedTags, untrackedMessageUuids };
}

export function drainNotificationAggregateTagsForOwner(ownerKey: string): string[] {
  const normalizedOwnerKey = normalizeNonEmptyString(ownerKey);
  if (normalizedOwnerKey == null) {
    return [];
  }

  const scopedPrefix = `bucket:${normalizedOwnerKey}::`;
  const tags = [...aggregatesByTag.keys()].filter((tag) => tag.startsWith(scopedPrefix));
  const tagsSet = new Set(tags);

  for (const tag of tags) {
    aggregatesByTag.delete(tag);
  }

  for (const [messageScopeKey, tag] of messageUuidToAggregateTag) {
    if (tagsSet.has(tag)) {
      messageUuidToAggregateTag.delete(messageScopeKey);
    }
  }

  return tags;
}

export function clearNotificationAggregateRegistry(): void {
  aggregatesByTag.clear();
  messageUuidToAggregateTag.clear();
}
