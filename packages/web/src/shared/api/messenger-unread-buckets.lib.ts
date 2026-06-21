// Bucket parsers for the messenger API unread payloads (streams, PMs, message list).
import { isMessageId, normalizeMessageId } from "~/shared/lib/message-id.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { WorkspaceUnreadDmBucket, WorkspaceUnreadStreamBucket } from "./messenger-unread.lib";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function readStreamUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseUnreadMessageIds(value: unknown): MessageId[] {
  if (!Array.isArray(value)) return [];
  const result: MessageId[] = [];
  for (const rawId of value) {
    const messageId = normalizeMessageId(rawId);
    if (messageId == null) continue;
    result.push(messageId);
  }
  return result;
}

export function parseStreamUnreadBuckets(streamsRaw: unknown): WorkspaceUnreadStreamBucket[] {
  if (!Array.isArray(streamsRaw)) return [];
  const streams: WorkspaceUnreadStreamBucket[] = [];
  for (const entry of streamsRaw) {
    if (!isRecord(entry)) continue;
    const streamId = readStreamUuid(entry.stream_uuid);
    if (streamId == null) continue;
    const topicRaw = typeof entry.topic === "string" ? entry.topic : "";
    const topic = normalizeTopicForIdentity(topicRaw);
    const unreadMessageIds = parseUnreadMessageIds(entry.unread_message_ids);
    if (unreadMessageIds.length === 0) continue;
    streams.push({ streamId, topic, unreadMessageIds });
  }
  return streams;
}

export function parsePmUnreadBuckets(pmsRaw: unknown): WorkspaceUnreadDmBucket[] {
  if (!Array.isArray(pmsRaw)) return [];
  const dms: WorkspaceUnreadDmBucket[] = [];
  for (const entry of pmsRaw) {
    if (!isRecord(entry)) continue;
    const otherUserId = isPositiveInteger(entry.other_user_id)
      ? entry.other_user_id
      : entry.sender_id;
    if (!isPositiveInteger(otherUserId)) continue;
    const unreadMessageIds = parseUnreadMessageIds(entry.unread_message_ids);
    if (unreadMessageIds.length === 0) continue;
    dms.push({ userIds: [otherUserId], unreadMessageIds });
  }
  return dms;
}

export function parseDmParticipantIds(message: Record<string, unknown>): number[] {
  const displayRecipient = message.display_recipient;
  if (Array.isArray(displayRecipient)) {
    const ids = displayRecipient
      .map((entry) => (isRecord(entry) ? entry.id : null))
      .filter((id): id is number => isPositiveInteger(id));
    if (ids.length > 0) {
      return Array.from(new Set(ids)).sort((left, right) => left - right);
    }
  }
  if (isPositiveInteger(message.sender_id)) {
    return [message.sender_id];
  }
  return [];
}

export function isUnreadMessengerMessage(rawMessage: Record<string, unknown>): boolean {
  const messageId = rawMessage.id;
  if (!isMessageId(messageId)) return false;
  return !(Array.isArray(rawMessage.flags) && rawMessage.flags.includes("read"));
}

export function isStreamMessengerMessage(rawMessage: Record<string, unknown>): boolean {
  return (
    rawMessage.type === "stream" ||
    readStreamUuid(rawMessage.stream_uuid) != null
  );
}
