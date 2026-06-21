/**
 * Parses Workspace unread payloads (legacy `unread_msgs` or GET /messages?narrow=is:unread)
 * into total counts and sidebar reconciliation snapshots.
 */
import { normalizeMessageId } from "~/shared/lib/message-id.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import {
  isPositiveInteger,
  isRecord,
  isStreamMessengerMessage,
  isUnreadMessengerMessage,
  parseDmParticipantIds,
  parsePmUnreadBuckets,
  parseStreamUnreadBuckets,
  parseUnreadMessageIds,
} from "./messenger-unread-buckets.lib";

function toSafeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function resolveUnreadMsgsTotalCount(
  unreadMsgs: Record<string, unknown>,
  streamsRaw: unknown[],
  pmsRaw: unknown[],
): number {
  const directCount = toSafeCount(unreadMsgs.count);
  if (directCount > 0) return directCount;
  return (
    sumUnreadMessageIds(streamsRaw) +
    sumUnreadMessageIds(pmsRaw) +
    sumUnreadMessageIds(unreadMsgs.mentions)
  );
}

function sumUnreadMessageIds(entries: unknown): number {
  if (!Array.isArray(entries)) {
    return 0;
  }
  return entries.reduce((sum, entry) => {
    if (!isRecord(entry)) return sum;
    return sum + parseUnreadMessageIds(entry.unread_message_ids).length;
  }, 0);
}

export interface WorkspaceUnreadStreamBucket {
  streamId: number;
  topic: string;
  unreadMessageIds: MessageId[];
}

export interface WorkspaceUnreadDmBucket {
  userIds: number[];
  unreadMessageIds: MessageId[];
}

export interface MessengerUnreadMessagesSnapshot {
  streams: WorkspaceUnreadStreamBucket[];
  dms: WorkspaceUnreadDmBucket[];
  totalCount: number;
  /** Unread @mention message ids from register `unread_msgs.mentions` buckets. */
  mentionMessageIds: MessageId[];
  /** Workspace `old_unreads_missing` — snapshot truncated; caller should fall back to GET /messages. */
  oldUnreadsMissing?: boolean;
}

/** Parses `unread_msgs` from POST /register when `message` + `update_message_flags` are subscribed. */
export function parseRegisterUnreadSnapshot(registerData: {
  unread_msgs?: unknown;
}): MessengerUnreadMessagesSnapshot | null {
  if (registerData.unread_msgs == null) {
    return null;
  }
  const snapshot = parseUnreadMessagesSnapshot({ unread_msgs: registerData.unread_msgs });
  if (snapshot == null) {
    return null;
  }
  const unreadMsgs = registerData.unread_msgs;
  if (!isRecord(unreadMsgs) || unreadMsgs.old_unreads_missing !== true) {
    return snapshot;
  }
  return { ...snapshot, oldUnreadsMissing: true };
}

function parseUnreadMessagesSnapshotFromUnreadMsgs(
  payload: unknown,
): MessengerUnreadMessagesSnapshot | null {
  if (!isRecord(payload)) {
    return null;
  }
  const unreadMsgs = payload.unread_msgs;
  if (!isRecord(unreadMsgs)) {
    return null;
  }

  const streamsRaw = unreadMsgs.streams;
  const pmsRaw = unreadMsgs.pms;

  if (!Array.isArray(streamsRaw) || !Array.isArray(pmsRaw)) {
    return null;
  }

  const streams = parseStreamUnreadBuckets(streamsRaw);
  const dms = parsePmUnreadBuckets(pmsRaw);
  const mentionMessageIds = parseMentionUnreadMessageIds(unreadMsgs.mentions);

  // Prefer server-provided count; otherwise sum unread id array lengths.
  const totalCount = resolveUnreadMsgsTotalCount(unreadMsgs, streamsRaw, pmsRaw);

  return { streams, dms, totalCount, mentionMessageIds };
}

function parseMentionUnreadMessageIds(mentionsRaw: unknown): MessageId[] {
  if (!Array.isArray(mentionsRaw)) {
    return [];
  }
  const ids: MessageId[] = [];
  for (const entry of mentionsRaw) {
    if (!isRecord(entry)) continue;
    ids.push(...parseUnreadMessageIds(entry.unread_message_ids));
  }
  return ids;
}

export function countMentionsUnreadFromSnapshot(snapshot: MessengerUnreadMessagesSnapshot): number {
  return snapshot.mentionMessageIds.length;
}

function accumulateUnreadStreamMessage(
  streamBuckets: Map<string, WorkspaceUnreadStreamBucket>,
  rawMessage: Record<string, unknown>,
  messageId: MessageId,
): void {
  const streamId = rawMessage.stream_id;
  if (!isPositiveInteger(streamId)) return;
  const topicRaw = typeof rawMessage.subject === "string" ? rawMessage.subject : "";
  const topic = normalizeTopicForIdentity(topicRaw);
  const key = `${streamId}\t${topic}`;
  const existing = streamBuckets.get(key);
  if (existing) {
    existing.unreadMessageIds.push(messageId);
    return;
  }
  streamBuckets.set(key, { streamId, topic, unreadMessageIds: [messageId] });
}

function ingestUnreadMessageFromPayload(
  rawMessage: unknown,
  streamBuckets: Map<string, WorkspaceUnreadStreamBucket>,
  dmBuckets: Map<string, WorkspaceUnreadDmBucket>,
  unreadMessageIds: Set<MessageId>,
): void {
  if (!isRecord(rawMessage)) return;
  if (!isUnreadMessengerMessage(rawMessage)) return;
  const messageId = normalizeMessageId(rawMessage.id);
  if (messageId == null) return;

  unreadMessageIds.add(messageId);

  if (isStreamMessengerMessage(rawMessage)) {
    accumulateUnreadStreamMessage(streamBuckets, rawMessage, messageId);
    return;
  }

  accumulateUnreadDmMessage(dmBuckets, rawMessage, messageId);
}

function accumulateUnreadDmMessage(
  dmBuckets: Map<string, WorkspaceUnreadDmBucket>,
  rawMessage: Record<string, unknown>,
  messageId: MessageId,
): void {
  const participantIds = parseDmParticipantIds(rawMessage);
  if (participantIds.length === 0) return;
  // Workspace DMs are 1:1 only; skip any legacy multi-party (group) conversations.
  if (participantIds.length > 2) return;
  const key = participantIds.join(",");
  const existing = dmBuckets.get(key);
  if (existing) {
    existing.unreadMessageIds.push(messageId);
    return;
  }
  dmBuckets.set(key, {
    userIds: participantIds,
    unreadMessageIds: [messageId],
  });
}

function parseUnreadMessagesSnapshotFromMessages(
  payload: unknown,
): MessengerUnreadMessagesSnapshot | null {
  if (!isRecord(payload) || !Array.isArray(payload.messages)) {
    return null;
  }

  const streamBuckets = new Map<string, WorkspaceUnreadStreamBucket>();
  const dmBuckets = new Map<string, WorkspaceUnreadDmBucket>();
  const unreadMessageIds = new Set<MessageId>();

  for (const rawMessage of payload.messages) {
    ingestUnreadMessageFromPayload(rawMessage, streamBuckets, dmBuckets, unreadMessageIds);
  }

  return {
    streams: Array.from(streamBuckets.values()),
    dms: Array.from(dmBuckets.values()),
    totalCount: unreadMessageIds.size,
    mentionMessageIds: [],
  };
}

const UNREAD_SNAPSHOT_PARSERS: readonly ((
  payload: unknown,
) => MessengerUnreadMessagesSnapshot | null)[] = [
  parseUnreadMessagesSnapshotFromUnreadMsgs,
  parseUnreadMessagesSnapshotFromMessages,
];

/** Tries legacy `unread_msgs` first, then GET /messages payload. */
export function parseUnreadMessagesSnapshot(
  payload: unknown,
): MessengerUnreadMessagesSnapshot | null {
  for (const parse of UNREAD_SNAPSHOT_PARSERS) {
    const snapshot = parse(payload);
    if (snapshot != null) return snapshot;
  }
  return null;
}

const UNREAD_DM_SNAPSHOT_PARSERS: readonly ((
  payload: unknown,
) => MessengerUnreadMessagesSnapshot | null)[] = [
  parseUnreadMessagesSnapshotFromMessages,
  parseUnreadMessagesSnapshotFromUnreadMsgs,
];

/** DM badge polling uses GET /messages — prefer `messages` over stale `unread_msgs` on combined payloads. */
function parseUnreadDmMessagesSnapshot(payload: unknown): MessengerUnreadMessagesSnapshot | null {
  for (const parse of UNREAD_DM_SNAPSHOT_PARSERS) {
    const snapshot = parse(payload);
    if (snapshot != null) return snapshot;
  }
  return null;
}

/** Personal 1:1 for inactive-instance badge polling (stricter than sidebar row reconciliation). */
function isPersonalDmBucketForBadge(dm: WorkspaceUnreadDmBucket): boolean {
  // Legacy `unread_msgs.pms` buckets only include the other party's user id.
  if (dm.userIds.length === 1) return true;
  // `/messages` buckets list every participant — only two-user conversations are 1:1.
  return dm.userIds.length === 2;
}

/** Personal 1:1 DM unread count from register `unread_msgs` buckets (not global `count`). */
export function countPersonalDmUnreadFromSnapshot(
  snapshot: MessengerUnreadMessagesSnapshot,
): number {
  let total = 0;
  for (const dm of snapshot.dms) {
    if (!isPersonalDmBucketForBadge(dm)) continue;
    total += dm.unreadMessageIds.length;
  }
  return total;
}

export function parseUnreadMessagesCount(payload: unknown): number | null {
  const snapshot = parseUnreadMessagesSnapshot(payload);
  if (snapshot == null) {
    return null;
  }
  return snapshot.totalCount;
}

/**
 * Personal DM unread flag for inactive-instance polling (0 or 1).
 * Uses conversation-level presence in personal DM buckets, not global `unread_msgs.count`.
 */
export function parseUnreadDmMessagesCount(payload: unknown): number | null {
  const snapshot = parseUnreadDmMessagesSnapshot(payload);
  if (snapshot == null) {
    return null;
  }
  const hasPersonalDm = countPersonalDmUnreadFromSnapshot(snapshot) > 0;
  const hasMentions = countMentionsUnreadFromSnapshot(snapshot) > 0;
  return hasPersonalDm || hasMentions ? 1 : 0;
}
