import { conversationIdForStream } from "~/entities/messenger/messenger-ids.lib";
import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerUuid,
} from "~/entities/messenger/messenger.types";
import type { WorkspaceMessageBucketIndexOptions } from "./message.model.types";

export const EMPTY_WORKSPACE_MESSAGE_IDS: MessengerUuid[] = [];
export const EMPTY_WORKSPACE_MESSAGES: MessengerMessage[] = [];

export function removeWorkspaceMessageId(
  ids: readonly MessengerUuid[],
  id: MessengerUuid,
): MessengerUuid[] {
  return ids.filter((item) => item !== id);
}

export function sameWorkspaceMessageIds(
  left: readonly MessengerUuid[],
  right: readonly MessengerUuid[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]);
}

export function compareWorkspaceMessages(left: MessengerMessage, right: MessengerMessage): number {
  const createdAtOrder = left.createdAt.localeCompare(right.createdAt);
  if (createdAtOrder !== 0) return createdAtOrder;
  return left.uuid.localeCompare(right.uuid);
}

function compareMessageIdWithMessage(
  messageId: MessengerUuid,
  message: MessengerMessage,
  messagesById: Record<MessengerUuid, MessengerMessage>,
): number {
  const existingMessage = messagesById[messageId];
  if (existingMessage == null) return messageId.localeCompare(message.uuid);
  return compareWorkspaceMessages(existingMessage, message);
}

export function insertSortedWorkspaceMessageId(
  ids: readonly MessengerUuid[],
  message: MessengerMessage,
  messagesById: Record<MessengerUuid, MessengerMessage>,
  previousMessage: MessengerMessage | undefined,
): MessengerUuid[] {
  const existingIndex = ids.indexOf(message.uuid);
  if (existingIndex >= 0 && previousMessage?.createdAt === message.createdAt) {
    return ids as MessengerUuid[];
  }

  const baseIds = existingIndex >= 0 ? removeWorkspaceMessageId(ids, message.uuid) : [...ids];
  const lastId = baseIds.at(-1);
  if (lastId == null) return [message.uuid];
  if (compareMessageIdWithMessage(lastId, message, messagesById) <= 0) {
    return [...baseIds, message.uuid];
  }

  const firstId = baseIds[0];
  if (firstId == null || compareMessageIdWithMessage(firstId, message, messagesById) >= 0) {
    return [message.uuid, ...baseIds];
  }

  let low = 0;
  let high = baseIds.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const middleId = baseIds[middle];
    if (middleId == null || compareMessageIdWithMessage(middleId, message, messagesById) <= 0) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return [...baseIds.slice(0, low), message.uuid, ...baseIds.slice(low)];
}

function sortUniqueWorkspaceMessages(messages: readonly MessengerMessage[]): MessengerMessage[] {
  if (messages.length <= 1) return [...messages];

  const messagesByUuid = new Map<MessengerUuid, MessengerMessage>();
  for (const message of messages) {
    messagesByUuid.set(message.uuid, message);
  }
  return [...messagesByUuid.values()].sort(compareWorkspaceMessages);
}

function collectMergeableExistingMessageIds(
  existingIds: readonly MessengerUuid[],
  incomingIds: ReadonlySet<MessengerUuid>,
  messagesById: Record<MessengerUuid, MessengerMessage>,
): MessengerUuid[] {
  const seenExistingIds = new Set<MessengerUuid>();
  const existing: MessengerUuid[] = [];
  for (const messageId of existingIds) {
    if (incomingIds.has(messageId)) continue;
    if (seenExistingIds.has(messageId)) continue;
    if (messagesById[messageId] == null) continue;
    seenExistingIds.add(messageId);
    existing.push(messageId);
  }
  return existing;
}

export function mergeSortedWorkspaceMessageIds(
  existingIds: readonly MessengerUuid[],
  incomingMessages: readonly MessengerMessage[],
  messagesById: Record<MessengerUuid, MessengerMessage>,
): MessengerUuid[] {
  if (incomingMessages.length === 0) return existingIds as MessengerUuid[];

  const incoming = sortUniqueWorkspaceMessages(incomingMessages);
  const incomingIds = new Set(incoming.map((message) => message.uuid));
  const existing = collectMergeableExistingMessageIds(existingIds, incomingIds, messagesById);
  const result: MessengerUuid[] = [];
  let existingIndex = 0;
  let incomingIndex = 0;

  while (existingIndex < existing.length && incomingIndex < incoming.length) {
    const existingId = existing[existingIndex]!;
    const incomingMessage = incoming[incomingIndex]!;
    const existingMessage = messagesById[existingId]!;

    if (compareWorkspaceMessages(existingMessage, incomingMessage) <= 0) {
      result.push(existingId);
      existingIndex += 1;
    } else {
      result.push(incomingMessage.uuid);
      incomingIndex += 1;
    }
  }

  for (; existingIndex < existing.length; existingIndex += 1) {
    result.push(existing[existingIndex]!);
  }
  for (; incomingIndex < incoming.length; incomingIndex += 1) {
    result.push(incoming[incomingIndex]!.uuid);
  }

  return sameWorkspaceMessageIds(existingIds, result) ? (existingIds as MessengerUuid[]) : result;
}

export function conversationBucketsForWorkspaceMessage(
  message: MessengerMessage,
  options?: WorkspaceMessageBucketIndexOptions,
): MessengerConversationId[] {
  let conversationIds: MessengerConversationId[] =
    options?.conversationIds != null ? [...options.conversationIds] : [message.conversationId];

  if (options?.includeStreamConversation === true) {
    const streamConversationId = conversationIdForStream(message.streamUuid);
    if (!conversationIds.includes(streamConversationId)) {
      conversationIds = [...conversationIds, streamConversationId];
    }
  }

  return conversationIds;
}

export function isWorkspaceMessageReferencedOutsideConversations(
  messageIdsByConversationId: Record<MessengerConversationId, MessengerUuid[]>,
  excludedConversationIds: ReadonlySet<MessengerConversationId>,
  messageId: MessengerUuid,
): boolean {
  for (const [conversationId, messageIds] of Object.entries(messageIdsByConversationId)) {
    if (excludedConversationIds.has(conversationId)) continue;
    if (messageIds.includes(messageId)) return true;
  }
  return false;
}
