// Bucket parsers for Zulip unread payloads (streams, PMs, huddles, message list).
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { ZulipUnreadDmBucket, ZulipUnreadStreamBucket } from "./zulip-unread.lib";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parseUnreadMessageIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const result: number[] = [];
  for (const rawId of value) {
    if (!isPositiveInteger(rawId)) continue;
    result.push(rawId);
  }
  return result;
}

function parseUserIdsString(value: unknown): number[] {
  if (typeof value !== "string") return [];
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return [];
  const userIds: number[] = [];
  for (const part of parts) {
    const parsed = Number(part);
    if (!isPositiveInteger(parsed)) continue;
    userIds.push(parsed);
  }
  return Array.from(new Set(userIds)).sort((left, right) => left - right);
}

export function parseStreamUnreadBuckets(streamsRaw: unknown): ZulipUnreadStreamBucket[] {
  if (!Array.isArray(streamsRaw)) return [];
  const streams: ZulipUnreadStreamBucket[] = [];
  for (const entry of streamsRaw) {
    if (!isRecord(entry)) continue;
    const streamId = entry.stream_id;
    if (!isPositiveInteger(streamId)) continue;
    const topicRaw = typeof entry.topic === "string" ? entry.topic : "";
    const topic = normalizeTopicForIdentity(topicRaw);
    const unreadMessageIds = parseUnreadMessageIds(entry.unread_message_ids);
    if (unreadMessageIds.length === 0) continue;
    streams.push({ streamId, topic, unreadMessageIds });
  }
  return streams;
}

export function parsePmUnreadBuckets(pmsRaw: unknown): ZulipUnreadDmBucket[] {
  if (!Array.isArray(pmsRaw)) return [];
  const dms: ZulipUnreadDmBucket[] = [];
  for (const entry of pmsRaw) {
    if (!isRecord(entry)) continue;
    const otherUserId = isPositiveInteger(entry.other_user_id)
      ? entry.other_user_id
      : entry.sender_id;
    if (!isPositiveInteger(otherUserId)) continue;
    const unreadMessageIds = parseUnreadMessageIds(entry.unread_message_ids);
    if (unreadMessageIds.length === 0) continue;
    dms.push({ userIds: [otherUserId], unreadMessageIds, isGroup: false });
  }
  return dms;
}

export function parseHuddleUnreadBuckets(huddlesRaw: unknown): ZulipUnreadDmBucket[] {
  if (!Array.isArray(huddlesRaw)) return [];
  const dms: ZulipUnreadDmBucket[] = [];
  for (const entry of huddlesRaw) {
    if (!isRecord(entry)) continue;
    const userIds = parseUserIdsString(entry.user_ids_string);
    if (userIds.length === 0) continue;
    const unreadMessageIds = parseUnreadMessageIds(entry.unread_message_ids);
    if (unreadMessageIds.length === 0) continue;
    dms.push({ userIds, unreadMessageIds, isGroup: true });
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

export function isUnreadZulipMessage(rawMessage: Record<string, unknown>): boolean {
  const messageId = rawMessage.id;
  if (!isPositiveInteger(messageId)) return false;
  return !(Array.isArray(rawMessage.flags) && rawMessage.flags.includes("read"));
}

export function isStreamZulipMessage(rawMessage: Record<string, unknown>): boolean {
  return (
    rawMessage.type === "stream" ||
    (rawMessage.stream_id != null && isPositiveInteger(rawMessage.stream_id))
  );
}

export { isPositiveInteger, isRecord, parseUnreadMessageIds };
